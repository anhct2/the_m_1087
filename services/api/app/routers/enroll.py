"""
services/api/app/routers/enroll.py
Enroll management API — VPS HK.
Đọc từ enroll.* schema, không write (write là worker-enroll trên f87).
Ngoại lệ: backfill POST INSERT vào enroll.job_queue.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from ..core.db import get_conn
from ..core.auth import require_auth

router = APIRouter()


# ── Queue stats (cho metric cards) ─────────────────────────────
@router.get("/stats/queue")
def queue_stats(_=Depends(require_auth)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM enroll.v_queue_stats ORDER BY status")
            return cur.fetchall()


# ── Summary 24h ─────────────────────────────────────────────────
@router.get("/stats/summary")
def enroll_summary(_=Depends(require_auth)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    (SELECT COUNT(*) FROM enroll.enroll_sessions
                     WHERE created_at >= now()-interval '24h')            AS sessions_24h,
                    (SELECT COUNT(*) FROM enroll.enroll_sessions
                     WHERE created_at >= now()-interval '24h'
                       AND status='enrolled')                             AS enrolled_24h,
                    (SELECT COUNT(*) FROM enroll.enroll_sessions
                     WHERE created_at >= now()-interval '24h'
                       AND status='failed')                               AS failed_24h,
                    (SELECT COUNT(*) FROM enroll.person_profiles
                     WHERE is_active)                                     AS total_profiles,
                    (SELECT COUNT(DISTINCT room_id) FROM enroll.room_stays
                     WHERE exit_ts IS NULL)                               AS rooms_occupied,
                    (SELECT ROUND(AVG(overall_quality)::numeric, 3)
                     FROM enroll.enroll_sessions
                     WHERE status='enrolled'
                       AND created_at >= now()-interval '24h')            AS avg_quality_24h,
                    (SELECT COUNT(*) FROM enroll.job_queue
                     WHERE status='pending')                              AS jobs_pending,
                    (SELECT COUNT(*) FROM enroll.job_queue
                     WHERE status='running')                              AS jobs_running
            """)
            return dict(cur.fetchone())


# ── Sessions list ────────────────────────────────────────────────
@router.get("/sessions")
def list_sessions(
    room:      Optional[str] = None,
    status:    Optional[str] = None,
    direction: Optional[str] = None,
    limit:     int = Query(50, ge=1, le=200),
    offset:    int = Query(0, ge=0),
    _=Depends(require_auth),
):
    filters = ["1=1"]
    params  = {}
    if room:
        filters.append("vs.room_label = %(room)s")
        params["room"] = room
    if status:
        filters.append("vs.status = %(status)s")
        params["status"] = status
    if direction:
        filters.append("vs.direction = %(direction)s")
        params["direction"] = direction
    filter_params = dict(params)
    params.update({"limit": limit, "offset": offset})

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT COUNT(*) AS total
                FROM enroll.v_sessions vs
                WHERE {' AND '.join(filters)}
            """, filter_params)
            total = cur.fetchone()["total"]

            cur.execute(f"""
                SELECT vs.id, vs.job_id, vs.room_label, vs.event_time_vn, vs.status,
                       vs.direction,
                       vs.person_count, vs.persons_enrolled,
                       vs.recognized_person_id, vs.recognition_sim,
                       vs.recognized_name, vs.recognized_room, vs.recognized_gender,
                       vs.recognized_face_event_id,
                       vs.overall_quality, vs.best_face_score,
                       vs.stopped_at_cam, vs.used_video, vs.total_ms,
                       vs.error_msg, vs.warnings, vs.created_at,
                       vs.user_name, vs.method,
                       (SELECT ccr.frigate_event_id
                        FROM enroll.camera_clip_results ccr
                        WHERE ccr.enroll_session_id = vs.id
                          AND ccr.frigate_event_id IS NOT NULL
                        ORDER BY ccr.stopped_here DESC, ccr.confidence DESC NULLS LAST
                        LIMIT 1) AS snap_event_id
                FROM enroll.v_sessions vs
                WHERE {' AND '.join(filters)}
                ORDER BY vs.event_time_vn DESC
                LIMIT %(limit)s OFFSET %(offset)s
            """, params)
            rows = cur.fetchall()
    return {"items": [dict(r) for r in rows], "total": total}


# ── Session by unlock_id (gate-log cross-link) ──────────────────
# Must be BEFORE /sessions/{session_id} so FastAPI doesn't treat "by-unlock" as session_id
@router.get("/sessions/by-unlock/{unlock_id}")
def get_session_by_unlock(unlock_id: str, _=Depends(require_auth)):
    """Trả về cả incoming (enrollment) và outgoing (recognition) cho một unlock_id."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT es.id, es.status, es.direction,
                       es.person_count, es.persons_enrolled,
                       es.recognized_person_id, es.recognition_sim,
                       pp.display_name AS recognized_name,
                       pp.known_room   AS recognized_room,
                       pp.gender       AS recognized_gender
                FROM enroll.enroll_sessions es
                LEFT JOIN enroll.person_profiles pp ON pp.id = es.recognized_person_id
                WHERE es.unlock_id = %(uid)s
                ORDER BY es.direction
            """, {"uid": unlock_id})
            rows = cur.fetchall()
    result = {}
    for row in rows:
        d = dict(row)
        result[d["direction"]] = d
    return result


# ── Session detail ───────────────────────────────────────────────
@router.get("/sessions/{session_id}")
def get_session(session_id: str, _=Depends(require_auth)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT vs.*,
                       (SELECT ccr.frigate_event_id
                        FROM enroll.camera_clip_results ccr
                        WHERE ccr.enroll_session_id = vs.id
                          AND ccr.frigate_event_id IS NOT NULL
                        ORDER BY ccr.stopped_here DESC, ccr.confidence DESC NULLS LAST
                        LIMIT 1) AS snap_event_id
                FROM enroll.v_sessions vs WHERE vs.id = %(sid)s
            """,
                {"sid": session_id}
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "Session not found")

            cur.execute("""
                SELECT ccr.camera_id, ccr.camera_order, ccr.source_type,
                       ccr.frames_processed, ccr.persons_detected,
                       ccr.confidence, ccr.face_score,
                       ccr.stopped_here, ccr.has_multi_person, ccr.has_occlusion,
                       ccr.frigate_event_id,
                       gsc.clip_url, gsc.clip_finalized, gsc.snapshot_url
                FROM enroll.camera_clip_results ccr
                LEFT JOIN gate_session_clips gsc ON gsc.id = ccr.gsc_id
                WHERE ccr.enroll_session_id = %(sid)s
                ORDER BY ccr.camera_order
            """, {"sid": session_id})
            clips = cur.fetchall()

            cur.execute("""
                SELECT pp.id, pp.display_name, pp.known_room, pp.confidence_lvl,
                       pp.face_quality, pp.face_source_cam, pp.face_frame_count,
                       pp.age_estimate, pp.gender, pp.appearance_notes,
                       pp.enroll_count, pp.last_seen_ts, pp.body_ratio,
                       psm.is_new, psm.merge_sim
                FROM enroll.person_profiles pp
                JOIN enroll.person_session_map psm ON psm.person_id = pp.id
                WHERE psm.enroll_session_id = %(sid)s
            """, {"sid": session_id})
            persons = cur.fetchall()

    return {
        **dict(row),
        "camera_clips": [dict(c) for c in clips],
        "persons": [dict(p) for p in persons],
    }


# ── Search profiles (cho assign modal) ───────────────────────────
# PHẢI đặt TRƯỚC /profiles/{person_id} để FastAPI không match "search" là person_id
@router.get("/profiles/search")
def search_profiles(
    q:     str = Query(""),
    limit: int = Query(10, ge=1, le=50),
    _=Depends(require_auth),
):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, display_name, known_room, confidence_lvl,
                       gender, age_estimate, face_quality,
                       (SELECT ccr.frigate_event_id
                        FROM enroll.person_session_map psm
                        JOIN enroll.camera_clip_results ccr
                          ON ccr.enroll_session_id = psm.enroll_session_id
                        WHERE psm.person_id = pp.id
                          AND ccr.frigate_event_id IS NOT NULL
                        ORDER BY ccr.stopped_here DESC, ccr.confidence DESC NULLS LAST
                        LIMIT 1) AS face_event_id
                FROM enroll.person_profiles pp
                WHERE is_active
                  AND (display_name ILIKE %(q)s OR known_room ILIKE %(q)s)
                ORDER BY last_seen_ts DESC
                LIMIT %(limit)s
            """, {"q": f"%{q}%", "limit": limit})
            return [dict(r) for r in cur.fetchall()]


# ── Profiles list ────────────────────────────────────────────────
@router.get("/profiles")
def list_profiles(
    room:       Optional[str] = None,
    confidence: Optional[str] = None,
    date_from:  Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to:    Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    limit:      int = Query(50, ge=1, le=200),
    offset:     int = Query(0, ge=0),
    _=Depends(require_auth),
):
    filters = ["pp.is_active = true"]
    params  = {}
    if room:
        rooms = [r.strip() for r in room.split(",") if r.strip()]
        filters.append("pp.known_room = ANY(%(rooms)s)")
        params["rooms"] = rooms
    if confidence:
        filters.append("pp.confidence_lvl = %(conf)s")
        params["conf"] = confidence
    # Lọc theo ngày: hồ sơ có ít nhất 1 phiên enroll trong khoảng ngày
    if date_from or date_to:
        date_conds = []
        if date_from:
            date_conds.append("(es.event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= %(date_from)s")
            params["date_from"] = date_from
        if date_to:
            date_conds.append("(es.event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= %(date_to)s")
            params["date_to"] = date_to
        filters.append(f"""EXISTS (
            SELECT 1 FROM enroll.person_session_map psm_d
            JOIN enroll.enroll_sessions es ON es.id = psm_d.enroll_session_id
            WHERE psm_d.person_id = pp.id AND {' AND '.join(date_conds)}
        )""")
    params.update({"limit": limit, "offset": offset})

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT pp.id, pp.display_name, pp.known_room, pp.confidence_lvl,
                       pp.face_quality, pp.face_source_cam, pp.face_frame_count,
                       pp.age_estimate, pp.gender, pp.appearance_notes,
                       pp.enroll_count, pp.last_seen_ts, pp.body_ratio,
                       (SELECT ccr.frigate_event_id
                        FROM enroll.person_session_map psm
                        JOIN enroll.camera_clip_results ccr
                          ON ccr.enroll_session_id = psm.enroll_session_id
                        WHERE psm.person_id = pp.id
                          AND ccr.frigate_event_id IS NOT NULL
                        ORDER BY ccr.stopped_here DESC, ccr.confidence DESC NULLS LAST
                        LIMIT 1) AS face_event_id
                FROM enroll.person_profiles pp
                WHERE {' AND '.join(filters)}
                ORDER BY pp.last_seen_ts DESC
                LIMIT %(limit)s OFFSET %(offset)s
            """, params)
            return [dict(r) for r in cur.fetchall()]


# ── Profile detail ───────────────────────────────────────────────
@router.get("/profiles/{person_id}")
def get_profile(person_id: str, _=Depends(require_auth)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, display_name, known_room, confidence_lvl,
                       face_quality, face_source_cam, face_frame_count,
                       age_estimate, gender, appearance_notes,
                       enroll_count, first_seen_ts, last_seen_ts, body_ratio,
                       (SELECT ccr.frigate_event_id
                        FROM enroll.person_session_map psm
                        JOIN enroll.camera_clip_results ccr
                          ON ccr.enroll_session_id = psm.enroll_session_id
                        WHERE psm.person_id = pp.id
                          AND ccr.frigate_event_id IS NOT NULL
                        ORDER BY ccr.stopped_here DESC, ccr.confidence DESC NULLS LAST
                        LIMIT 1) AS face_event_id
                FROM enroll.person_profiles pp WHERE id = %(pid)s
            """, {"pid": person_id})
            row = cur.fetchone()
            if not row:
                raise HTTPException(404)

            cur.execute("""
                SELECT es.id, es.door_id, es.direction, es.room_label, es.event_time_vn,
                       es.status, es.overall_quality, psm.is_new, psm.merge_sim,
                       (SELECT ccr.frigate_event_id
                        FROM enroll.camera_clip_results ccr
                        WHERE ccr.enroll_session_id = es.id AND ccr.frigate_event_id IS NOT NULL
                        ORDER BY ccr.stopped_here DESC, ccr.confidence DESC NULLS LAST
                        LIMIT 1) AS snap_event_id
                FROM enroll.enroll_sessions es
                JOIN enroll.person_session_map psm ON psm.enroll_session_id = es.id
                WHERE psm.person_id = %(pid)s
                ORDER BY es.event_time_vn DESC LIMIT 60
            """, {"pid": person_id})
            sessions = cur.fetchall()

            session_ids = [str(s["id"]) for s in sessions]
            clips = []
            if session_ids:
                cur.execute("""
                    SELECT ccr.enroll_session_id, ccr.camera_id, ccr.camera_order,
                           ccr.frigate_event_id, ccr.confidence, ccr.stopped_here,
                           gsc.clip_url,
                           es.event_time_vn, es.door_id, es.direction
                    FROM enroll.camera_clip_results ccr
                    JOIN enroll.enroll_sessions es ON es.id = ccr.enroll_session_id
                    LEFT JOIN gate_session_clips gsc ON gsc.id = ccr.gsc_id
                    WHERE ccr.enroll_session_id = ANY(%(sids)s::uuid[]) AND ccr.frigate_event_id IS NOT NULL
                    ORDER BY es.event_time_vn DESC, ccr.camera_order
                """, {"sids": session_ids})
                clips = cur.fetchall()

            cur.execute("""
                SELECT room_id, entry_ts, exit_ts, entry_confidence, exit_confidence,
                       entry_door_id, exit_door_id
                FROM enroll.room_stays WHERE person_id = %(pid)s
                ORDER BY entry_ts DESC
            """, {"pid": person_id})
            stays = cur.fetchall()

            cur.execute("""
                SELECT ma.id, ma.door_id, ma.direction, ma.room_label, ma.source,
                       ma.assigned_by, ma.assigned_at
                FROM enroll.manual_assignments ma
                WHERE ma.person_id = %(pid)s
                ORDER BY ma.assigned_at DESC
            """, {"pid": person_id})
            manual_log = cur.fetchall()

    return {
        **dict(row),
        "sessions":          [dict(s) for s in sessions],
        "clips":             [dict(c) for c in clips],
        "stays":             [dict(s) for s in stays],
        "manual_assignments": [dict(m) for m in manual_log],
    }


# ── Rename profile ───────────────────────────────────────────────
@router.patch("/profiles/{person_id}")
def update_profile(person_id: str, body: dict, _=Depends(require_auth)):
    name = body.get("display_name", "").strip()
    if not name:
        raise HTTPException(400, "display_name required")
    with get_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE enroll.person_profiles
                SET display_name = %(name)s, updated_at = now()
                WHERE id = %(pid)s
            """, {"name": name, "pid": person_id})
        conn.commit()
    return {"ok": True}


# ── Occupancy ────────────────────────────────────────────────────
@router.get("/occupancy")
def get_occupancy(
    date_from: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to:   Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    _=Depends(require_auth),
):
    """
    Xem theo hồ sơ. Không có ngày → lưu trú đang mở (như v_occupancy).
    Có ngày → các lượt lưu trú GIAO với khoảng ngày (kể cả đã rời đi), để
    xem lại lịch sử ai đã ở phòng nào trong khoảng đó.
    """
    where = ["1=1"]
    params: dict = {}
    if date_from or date_to:
        if date_from:
            where.append("(rs.exit_ts IS NULL OR (rs.exit_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= %(date_from)s)")
            params["date_from"] = date_from
        if date_to:
            where.append("(rs.entry_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= %(date_to)s")
            params["date_to"] = date_to
    else:
        where.append("rs.exit_ts IS NULL")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT rs.room_id, rs.person_id, pp.display_name, pp.known_room,
                       pp.confidence_lvl, pp.face_quality, pp.gender, pp.age_estimate,
                       pp.appearance_notes, rs.entry_ts, rs.exit_ts, rs.entry_confidence,
                       EXTRACT(EPOCH FROM (COALESCE(rs.exit_ts, now()) - rs.entry_ts)) / 3600.0 AS hours_in_room,
                       (rs.exit_ts IS NULL) AS active,
                       (SELECT ccr.frigate_event_id
                        FROM enroll.person_session_map psm
                        JOIN enroll.camera_clip_results ccr ON ccr.enroll_session_id = psm.enroll_session_id
                        WHERE psm.person_id = pp.id AND ccr.frigate_event_id IS NOT NULL
                        ORDER BY ccr.stopped_here DESC, ccr.confidence DESC NULLS LAST
                        LIMIT 1) AS face_event_id
                FROM enroll.room_stays rs
                JOIN enroll.person_profiles pp ON pp.id = rs.person_id
                WHERE {' AND '.join(where)} AND pp.is_active
                ORDER BY rs.entry_ts DESC
            """, params)
            return [dict(r) for r in cur.fetchall()]


# ── Lưu trú theo cửa sổ phòng (12h trưa → 12h trưa hôm sau) ─────
# Quy tắc: 1 "ngày phòng" D = [D 12:00 VN, D+1 12:00 VN). Mọi phép map
# người ↔ phòng theo ngày dùng cửa sổ này (enroll.room_window_date).

@router.get("/stays/by-gate")
def stays_by_gate(
    date_from: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to:   Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    room:      Optional[str] = None,
    direction: Optional[str] = Query(None, pattern="^(incoming|outgoing)$"),
    limit:     int = Query(500, ge=1, le=2000),
    _=Depends(require_auth),
):
    """
    Lưu trú theo GATE LOG: ngày (cửa sổ phòng) → phòng → gate log → profile.
    Bám vào v_room_day_gate (gốc là v_gate_sessions = đúng tập Gate Log).
    Không truyền ngày → 7 cửa sổ phòng gần nhất.
    """
    filters = ["1=1"]
    params: dict = {"limit": limit}
    if date_from:
        filters.append("window_date >= %(date_from)s"); params["date_from"] = date_from
    else:
        filters.append("window_date >= enroll.room_window_date(now()) - 6")
    if date_to:
        filters.append("window_date <= %(date_to)s"); params["date_to"] = date_to
    if room:
        rooms = [r.strip() for r in room.split(",") if r.strip()]
        filters.append("room_label = ANY(%(rooms)s)"); params["rooms"] = rooms
    if direction:
        filters.append("direction = %(direction)s"); params["direction"] = direction

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT * FROM enroll.v_room_day_gate
                WHERE {' AND '.join(filters)}
                ORDER BY window_date DESC, room_label NULLS LAST, event_time_vn
                LIMIT %(limit)s
            """, params)
            return [dict(r) for r in cur.fetchall()]


@router.get("/stays/by-profile")
def stays_by_profile(
    date_from: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to:   Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    room:      Optional[str] = None,
    limit:     int = Query(500, ge=1, le=2000),
    _=Depends(require_auth),
):
    """
    Lưu trú theo PROFILE: ngày (cửa sổ phòng) → phòng → profile, kèm số lượt
    vào/ra trong cửa sổ đó → trả lời "phòng đó có mấy người theo từng ngày".
    Không truyền ngày → 7 cửa sổ phòng gần nhất.
    """
    filters = ["1=1"]
    params: dict = {"limit": limit}
    if date_from:
        filters.append("window_date >= %(date_from)s"); params["date_from"] = date_from
    else:
        filters.append("window_date >= enroll.room_window_date(now()) - 6")
    if date_to:
        filters.append("window_date <= %(date_to)s"); params["date_to"] = date_to
    if room:
        rooms = [r.strip() for r in room.split(",") if r.strip()]
        filters.append("room_label = ANY(%(rooms)s)"); params["rooms"] = rooms

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT * FROM enroll.v_room_day_profiles
                WHERE {' AND '.join(filters)}
                ORDER BY window_date DESC, room_label, first_seen_ts
                LIMIT %(limit)s
            """, params)
            return [dict(r) for r in cur.fetchall()]


# ── Job gộp profile theo phòng + cụm cửa sổ thời gian ───────────
@router.post("/merge-room-profiles")
def merge_room_profiles_endpoint(body: Optional[dict] = None, _=Depends(require_auth)):
    """
    Chạy tay job gộp profile (worker-enroll cũng tự chạy định kỳ).
    Body (tuỳ chọn): { "days": 7, "room": "P.302" }
    Cùng phòng + cùng/kề cửa sổ (khách ở dài ngày) → gộp khi sim >= 0.55;
    khác cụm cửa sổ (phòng có thể đã đổi khách) → chỉ gộp khi sim >= 0.78.
    """
    body = body or {}
    days = int(body.get("days", 7))
    room = (body.get("room") or "").strip() or None

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM enroll.merge_room_profiles(%(d)s, 0.55, 0.78, %(room)s)",
                {"d": days, "room": room},
            )
            merges = [dict(r) for r in cur.fetchall()]
        conn.commit()
    return {"merged": len(merges), "pairs": merges}


def _auto_merge_room(conn, room: str) -> int:
    """Best-effort: gộp lại profile của MỘT phòng ngay sau khi gán tay
    (gán tay outgoing = định danh luôn → cần gom profile cùng người lại).
    Không làm hỏng request nếu migration chưa được áp dụng."""
    if not room:
        return 0
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS n FROM enroll.merge_room_profiles(7, 0.55, 0.78, %(room)s)",
                {"room": room},
            )
            n = int(cur.fetchone()["n"] or 0)
        conn.commit()
        return n
    except Exception:
        conn.rollback()
        return 0


# ── Job queue ────────────────────────────────────────────────────
@router.get("/jobs")
def list_jobs(
    status: Optional[str] = None,
    limit:  int = Query(50, ge=1, le=200),
    _=Depends(require_auth),
):
    filters = ["created_at >= now() - interval '7 days'"]
    params  = {}
    if status:
        filters.append("status = %(status)s")
        params["status"] = status
    params["limit"] = limit

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT id, room_label, event_time_vn, status, direction,
                       attempt_count, max_attempts, last_error,
                       scheduled_at, started_at, finished_at, locked_by
                FROM enroll.job_queue
                WHERE {' AND '.join(filters)}
                ORDER BY created_at DESC
                LIMIT %(limit)s
            """, params)
            return [dict(r) for r in cur.fetchall()]


# ── Backfill ─────────────────────────────────────────────────────
@router.post("/backfill")
def backfill(body: dict, _=Depends(require_auth)):
    """
    Enqueue lại các gate events chưa có job.
    Body: { "days": 7, "room": "P.302" (optional), "direction": "incoming" (optional) }
    """
    days      = int(body.get("days", 7))
    room      = body.get("room", "").strip() or None
    direction = body.get("direction", "incoming").strip().lower()

    params: dict = {"days": str(days)}
    if room:
        params["room"] = room

    with get_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            if direction == "outgoing":
                # Outgoing: mỗi (session_id, phút) = 1 người ra
                # unlock_id = time_bucket (VN minute) thay vì session_id
                # để số job = số gate log events, không gộp chung nhiều người vào 1 job
                room_filter = "AND gsc.label = %(room)s" if room else ""
                cur.execute(f"""
                    SELECT DISTINCT ON (gsc.session_id, date_trunc('minute', gsc.event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh'))
                        gsc.session_id::text AS door_id,
                        to_char(
                            date_trunc('minute', gsc.event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh'),
                            'YYYY-MM-DD HH24:MI:SS'
                        )                    AS unlock_id,
                        gsc.event_time_vn,
                        COALESCE(
                            (SELECT label FROM gate_session_clips g2
                             WHERE g2.session_id = gsc.session_id
                               AND date_trunc('minute', g2.event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh')
                                   = date_trunc('minute', gsc.event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh')
                               AND g2.label LIKE 'P.%%'
                             LIMIT 1), ''
                        )                    AS room_label
                    FROM gate_session_clips gsc
                    WHERE gsc.direction     = 'outgoing'
                      AND gsc.event_time_vn >= now() - (%(days)s || ' days')::interval
                      {room_filter}
                      -- Bỏ qua nếu đang pending/running
                      AND NOT EXISTS (
                          SELECT 1 FROM enroll.job_queue jq
                          WHERE jq.door_id   = gsc.session_id::text
                            AND jq.unlock_id = to_char(
                                date_trunc('minute', gsc.event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh'),
                                'YYYY-MM-DD HH24:MI:SS')
                            AND jq.direction = 'outgoing'
                            AND jq.status IN ('pending','running')
                      )
                      -- Bỏ qua nếu đã nhận diện được người
                      AND NOT EXISTS (
                          SELECT 1 FROM enroll.enroll_sessions es
                          WHERE es.door_id   = gsc.session_id::text
                            AND es.unlock_id = to_char(
                                date_trunc('minute', gsc.event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh'),
                                'YYYY-MM-DD HH24:MI:SS')
                            AND es.direction = 'outgoing'
                            AND es.recognized_person_id IS NOT NULL
                      )
                    ORDER BY gsc.session_id,
                             date_trunc('minute', gsc.event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh'),
                             gsc.event_time_vn DESC
                """, params)
            else:
                room_filter = "AND gs.label = %(room)s" if room else ""
                cur.execute(f"""
                    SELECT gs.door_id, gs.unlock_id,
                           gs.event_time_vn, gs.label AS room_label
                    FROM gate_sessions_v2 gs
                    WHERE gs.method   = 'password'
                      AND gs.label    LIKE 'P.%%'
                      AND gs.direction = 'incoming'
                      AND gs.event_time_vn >= now() - (%(days)s || ' days')::interval
                      {room_filter}
                      AND NOT EXISTS (
                          SELECT 1 FROM enroll.job_queue jq
                          WHERE jq.door_id   = gs.door_id::text
                            AND jq.unlock_id = gs.unlock_id::text
                            AND jq.direction = 'incoming'
                            AND jq.status IN ('pending','running','done')
                      )
                """, params)
            rows = cur.fetchall()

            count = 0
            for r in rows:
                cur.execute("""
                    INSERT INTO enroll.job_queue
                        (door_id, unlock_id, event_time_vn, room_label, direction,
                         status, scheduled_at)
                    VALUES (%(d)s, %(u)s, %(t)s, %(r)s, %(dir)s, 'pending', now())
                    ON CONFLICT (door_id, unlock_id, direction) DO UPDATE
                        SET status        = 'pending',
                            attempt_count = 0,
                            scheduled_at  = now(),
                            last_error    = NULL,
                            locked_by     = NULL,
                            locked_at     = NULL,
                            started_at    = NULL,
                            finished_at   = NULL
                """, {"d": str(r["door_id"]), "u": str(r["unlock_id"]),
                      "t": r["event_time_vn"], "r": r["room_label"], "dir": direction})
                if cur.rowcount:
                    count += 1
        conn.commit()

    return {"enqueued": count, "total_found": len(rows), "direction": direction}


# ── Cancel job ───────────────────────────────────────────────────
@router.delete("/jobs/{job_id}")
def cancel_job(job_id: int, _=Depends(require_auth)):
    with get_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE enroll.job_queue
                SET status='skipped', last_error='cancelled by user', finished_at=now()
                WHERE id=%(jid)s AND status='pending'
            """, {"jid": job_id})
        conn.commit()
    return {"ok": True}


# ── Retry failed job ─────────────────────────────────────────────
@router.post("/jobs/{job_id}/retry")
def retry_job(job_id: int, _=Depends(require_auth)):
    with get_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE enroll.job_queue SET
                    status        = 'pending',
                    attempt_count = 0,
                    scheduled_at  = now(),
                    last_error    = NULL,
                    locked_by     = NULL,
                    locked_at     = NULL,
                    started_at    = NULL,
                    finished_at   = NULL
                WHERE id=%(jid)s AND status IN ('failed','skipped')
            """, {"jid": job_id})
            if cur.rowcount == 0:
                raise HTTPException(400, "Job không ở trạng thái failed/skipped")
        conn.commit()
    return {"ok": True}


# ── Retry session: reset job về pending ─────────────────────────
@router.post("/sessions/{session_id}/retry")
def retry_session(session_id: str, _=Depends(require_auth)):
    with get_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute(
                "SELECT job_id FROM enroll.enroll_sessions WHERE id = %(id)s",
                {"id": session_id}
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "Session not found")
            job_id = row["job_id"]
            if not job_id:
                raise HTTPException(400, "Session không có job liên kết")

            cur.execute("""
                UPDATE enroll.enroll_sessions
                SET status = 'processing', error_msg = NULL, warnings = NULL,
                    finished_at = NULL
                WHERE id = %(id)s
            """, {"id": session_id})

            cur.execute("""
                UPDATE enroll.job_queue SET
                    status        = 'pending',
                    attempt_count = 0,
                    scheduled_at  = now(),
                    last_error    = NULL,
                    locked_by     = NULL,
                    locked_at     = NULL,
                    started_at    = NULL,
                    finished_at   = NULL
                WHERE id = %(jid)s
            """, {"jid": job_id})
        conn.commit()
    return {"ok": True, "job_id": job_id}


# ── Gán thủ công profile vào session (core logic, dùng chung) ───
def _apply_manual_assignment(
    cur, *, session_id: str, door_id: str, direction: str, event_time_vn,
    room_label: str, unlock_id, profile_id, new_name, new_room, source: str, user: str,
):
    """
    Áp dụng gán người/phòng thủ công cho MỘT enroll_session đã tồn tại.
    Dùng chung bởi:
      - POST /sessions/{id}/assign        (session đã có sẵn, id = enroll_sessions.id)
      - POST /gate-sessions/{door_id}/assign (session có thể vừa được tạo tại chỗ)

    Hành vi thống nhất bất kể incoming/outgoing ("gán tay coi như enroll đã
    xác định người + gán phòng giống incoming"):
      - Luôn set/update known_room của profile theo phòng được gán.
      - Luôn đảm bảo có 1 room_stay đang mở (mở mới nếu chưa có) — mô phỏng
        đúng bước upsert_profile() của worker-enroll khi enroll một người mới.
      - Nếu là outgoing thì đóng luôn room_stay đó (rời phòng).
      - Ghi lại vào enroll.manual_assignments để có audit trail.
    """
    if not profile_id:
        cur.execute("""
            INSERT INTO enroll.person_profiles
                (display_name, known_room, confidence_lvl)
            VALUES (%(name)s, %(room)s, 'gate_code')
            RETURNING id
        """, {"name": new_name, "room": new_room or room_label or None})
        profile_id = str(cur.fetchone()["id"])
    else:
        final_room = new_room or room_label
        if final_room:
            cur.execute(
                "UPDATE enroll.person_profiles SET known_room = %(room)s, updated_at = now() WHERE id = %(pid)s",
                {"room": final_room, "pid": profile_id},
            )

    cur.execute("""
        INSERT INTO enroll.person_session_map
            (person_id, enroll_session_id, is_new, merge_sim)
        VALUES (%(pid)s, %(sid)s, false, 1.0)
        ON CONFLICT (person_id, enroll_session_id) DO NOTHING
    """, {"pid": profile_id, "sid": session_id})

    # Gán tay là quyết định cuối cùng của người vận hành — luôn ghi đè
    # recognized_person_id/sim (kể cả khi trước đó auto-match ra người khác),
    # không COALESCE giữ giá trị cũ.
    cur.execute("""
        UPDATE enroll.enroll_sessions
        SET status               = 'enrolled',
            persons_enrolled     = GREATEST(persons_enrolled, 1),
            recognized_person_id = %(pid)s,
            recognition_sim      = 1.0,
            finished_at          = COALESCE(finished_at, now())
        WHERE id = %(id)s
    """, {"pid": profile_id, "id": session_id})

    unlock_id_str = str(unlock_id) if unlock_id is not None else None

    if direction == "outgoing":
        cur.execute(
            "SELECT enroll.close_room_stay(%s, %s, %s, %s, 'manual') AS n",
            (profile_id, event_time_vn, door_id, unlock_id_str),
        )
    else:
        cur.execute(
            "SELECT id FROM enroll.room_stays WHERE person_id = %(pid)s AND exit_ts IS NULL",
            {"pid": profile_id},
        )
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO enroll.room_stays
                    (person_id, room_id, entry_door_id, entry_unlock_id, entry_ts, entry_confidence)
                VALUES (%(pid)s, %(room)s, %(d)s, %(u)s, %(t)s, 'manual')
            """, {"pid": profile_id, "room": new_room or room_label or "",
                  "d": door_id, "u": unlock_id_str, "t": event_time_vn})

    cur.execute("""
        UPDATE enroll.person_profiles
        SET last_seen_ts = now(), enroll_count = enroll_count + 1,
            updated_at = now()
        WHERE id = %(pid)s
    """, {"pid": profile_id})

    # Gắn nhãn phòng lên chính gate_session_clips để HIỂN THỊ ở cả Gate Log và
    # danh sách Phiên (cả hai đọc label từ đây). Đây là mục đích chính của gán
    # tay: thống kê phòng nào ra/vào lúc nào + thêm dữ liệu huấn luyện.
    _tag_gate_room(cur, door_id, direction, new_room or room_label)

    cur.execute("""
        INSERT INTO enroll.manual_assignments
            (door_id, direction, enroll_session_id, person_id, room_label, source, assigned_by)
        VALUES (%(d)s, %(dir)s, %(sid)s, %(pid)s, %(room)s, %(src)s, %(by)s)
    """, {"d": door_id, "dir": direction, "sid": session_id, "pid": profile_id,
          "room": new_room or room_label or None, "src": source, "by": user})

    return profile_id


def _tag_gate_room(cur, door_id: str, direction: str, room: str):
    """Ghi nhãn phòng vào gate_session_clips (mapper/worker không ghi đè cột
    label khi upsert nên nhãn thủ công này bền vững)."""
    if not room:
        return
    cur.execute("""
        UPDATE gate_session_clips
        SET label = %(room)s
        WHERE session_id::text = %(d)s AND direction = %(dir)s
    """, {"room": room, "d": str(door_id), "dir": direction})


@router.post("/sessions/{session_id}/assign")
def assign_session(session_id: str, body: dict, user: str = Depends(require_auth)):
    profile_id = (body.get("profile_id") or "").strip() or None
    new_name   = (body.get("display_name") or "").strip() or None
    new_room   = (body.get("known_room") or "").strip() or None

    with get_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute(
                "SELECT room_label, direction, event_time_vn, door_id, unlock_id "
                "FROM enroll.enroll_sessions WHERE id = %(id)s",
                {"id": session_id}
            )
            ses = cur.fetchone()
            if not ses:
                raise HTTPException(404, "Session not found")

            profile_id = _apply_manual_assignment(
                cur, session_id=session_id, door_id=ses["door_id"], direction=ses["direction"],
                event_time_vn=ses["event_time_vn"], room_label=ses["room_label"],
                unlock_id=ses["unlock_id"], profile_id=profile_id, new_name=new_name,
                new_room=new_room, source="enroll", user=user,
            )
        conn.commit()
        merged = _auto_merge_room(conn, new_room or ses["room_label"])
    return {"ok": True, "profile_id": profile_id, "auto_merged": merged}


# ── Gate Log <-> Enroll unified sessions (1:1 với gate_sessions_v2) ──
@router.get("/gate-sessions")
def list_gate_sessions(
    direction: Optional[str] = Query(None, pattern="^(incoming|outgoing)$"),
    room:      Optional[str] = None,
    user_name: Optional[str] = None,
    status:    Optional[str] = None,
    date_from: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to:   Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    limit:     int = Query(50, ge=1, le=200),
    offset:    int = Query(0, ge=0),
    _=Depends(require_auth),
):
    """
    Danh sách session lấy từ enroll.v_gate_sessions — view này bắt nguồn
    từ gate_session_clips (is_best_match=TRUE), CHÍNH XÁC cùng tập dữ liệu
    mà GET /api/sessions (Gate Log) đếm/liệt kê. Vì vậy với cùng bộ filter
    (direction/room/user_name/ngày), tổng số session ở đây luôn khớp 1-1 với
    Gate Log — kể cả những session chưa có job/enroll_session (hiện
    effective_status = 'not_queued').
    """
    filters = ["1=1"]
    params: dict = {}
    if direction:
        filters.append("direction = %(direction)s"); params["direction"] = direction
    if room:
        rooms = [r.strip() for r in room.split(",") if r.strip()]
        filters.append("room_label = ANY(%(rooms)s)"); params["rooms"] = rooms
    if user_name:
        filters.append("gate_user_name ILIKE %(user_name)s"); params["user_name"] = f"%{user_name}%"
    if status:
        filters.append("effective_status = %(status)s"); params["status"] = status
    if date_from:
        filters.append("(event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= %(date_from)s")
        params["date_from"] = date_from
    if date_to:
        filters.append("(event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= %(date_to)s")
        params["date_to"] = date_to

    where = " AND ".join(filters)
    count_params = dict(params)
    params.update({"limit": limit, "offset": offset})

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) AS total FROM enroll.v_gate_sessions WHERE {where}", count_params)
            total = cur.fetchone()["total"]

            cur.execute(f"""
                SELECT * FROM enroll.v_gate_sessions
                WHERE {where}
                ORDER BY event_time_vn DESC
                LIMIT %(limit)s OFFSET %(offset)s
            """, params)
            rows = cur.fetchall()

    return {"items": [dict(r) for r in rows], "total": total}


@router.get("/gate-sessions/{door_id}")
def get_gate_session_detail(door_id: str, _=Depends(require_auth)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM enroll.v_gate_sessions WHERE door_id = %(d)s", {"d": door_id})
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "Session not found")

            # Phòng đã được gán/enroll (có thể khác nhãn gate log gốc)
            enroll_room_label = None
            if row["enroll_session_id"]:
                cur.execute(
                    "SELECT room_label FROM enroll.enroll_sessions WHERE id = %(sid)s",
                    {"sid": row["enroll_session_id"]},
                )
                r2 = cur.fetchone()
                enroll_room_label = r2["room_label"] if r2 else None

            cur.execute("""
                SELECT id, frigate_event_id, camera, frigate_label, frigate_score,
                    delta_seconds, clip_finalized, codec, snapshot_url, clip_url,
                    match_score, is_best_match, manual_best_match,
                    (event_start_time AT TIME ZONE 'Asia/Ho_Chi_Minh') AS start_local,
                    (event_end_time   AT TIME ZONE 'Asia/Ho_Chi_Minh') AS end_local
                FROM gate_session_clips
                WHERE session_id = %(d)s
                ORDER BY match_score ASC
            """, {"d": door_id})
            gate_clips = cur.fetchall()

            camera_clips, persons = [], []
            if row["enroll_session_id"]:
                cur.execute("""
                    SELECT ccr.camera_id, ccr.camera_order, ccr.source_type,
                           ccr.frames_processed, ccr.persons_detected,
                           ccr.confidence, ccr.face_score,
                           ccr.stopped_here, ccr.has_multi_person, ccr.has_occlusion,
                           ccr.frigate_event_id,
                           gsc.clip_url, gsc.clip_finalized, gsc.snapshot_url
                    FROM enroll.camera_clip_results ccr
                    LEFT JOIN gate_session_clips gsc ON gsc.id = ccr.gsc_id
                    WHERE ccr.enroll_session_id = %(sid)s
                    ORDER BY ccr.camera_order
                """, {"sid": row["enroll_session_id"]})
                camera_clips = cur.fetchall()

                cur.execute("""
                    SELECT pp.id, pp.display_name, pp.known_room, pp.confidence_lvl,
                           pp.face_quality, pp.gender, pp.age_estimate,
                           pp.enroll_count, pp.last_seen_ts,
                           psm.is_new, psm.merge_sim,
                           (SELECT ccr2.frigate_event_id
                            FROM enroll.person_session_map psm2
                            JOIN enroll.camera_clip_results ccr2
                              ON ccr2.enroll_session_id = psm2.enroll_session_id
                            WHERE psm2.person_id = pp.id AND ccr2.frigate_event_id IS NOT NULL
                            ORDER BY ccr2.stopped_here DESC, ccr2.confidence DESC NULLS LAST
                            LIMIT 1) AS face_event_id
                    FROM enroll.person_profiles pp
                    JOIN enroll.person_session_map psm ON psm.person_id = pp.id
                    WHERE psm.enroll_session_id = %(sid)s
                """, {"sid": row["enroll_session_id"]})
                persons = cur.fetchall()

            cur.execute("""
                SELECT ma.id, ma.person_id, ma.room_label, ma.source, ma.assigned_by, ma.assigned_at,
                       pp.display_name
                FROM enroll.manual_assignments ma
                LEFT JOIN enroll.person_profiles pp ON pp.id = ma.person_id
                WHERE ma.door_id = %(d)s
                ORDER BY ma.assigned_at DESC
            """, {"d": door_id})
            manual_log = cur.fetchall()

    return {
        **dict(row),
        "enroll_room_label":  enroll_room_label,
        "gate_clips":         [dict(c) for c in gate_clips],
        "camera_clips":       [dict(c) for c in camera_clips],
        "persons":            [dict(p) for p in persons],
        "manual_assignments": [dict(m) for m in manual_log],
    }


@router.post("/gate-sessions/{door_id}/assign")
def assign_gate_session(door_id: str, body: dict, user: str = Depends(require_auth)):
    """
    Gán người/phòng thủ công theo door_id (khoá dùng chung giữa Gate Log
    và Enroll). Nếu chưa có enroll_sessions cho door_id này (chưa được
    worker xử lý / chưa nằm trong diện backfill) thì tạo mới tại chỗ rồi
    áp dụng gán — coi như một lần "enroll" thủ công.
    """
    profile_id = (body.get("profile_id") or "").strip() or None
    new_name   = (body.get("display_name") or "").strip() or None
    new_room   = (body.get("known_room") or "").strip() or None
    source     = (body.get("source") or "enroll").strip()

    with get_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute("""
                SELECT session_id AS door_id, unlock_id, direction, label AS room_label, event_time_vn
                FROM gate_session_clips
                WHERE session_id = %(d)s AND is_best_match = TRUE
                LIMIT 1
            """, {"d": door_id})
            gate = cur.fetchone()
            if not gate:
                raise HTTPException(404, "Gate session not found")

            cur.execute(
                "SELECT id, unlock_id FROM enroll.enroll_sessions WHERE door_id = %(d)s AND direction = %(dir)s",
                {"d": door_id, "dir": gate["direction"]},
            )
            es = cur.fetchone()

            if es:
                session_id = str(es["id"])
                unlock_id  = es["unlock_id"]
            else:
                unlock_id = gate["unlock_id"] if gate["unlock_id"] is not None \
                    else gate["event_time_vn"].strftime("%Y-%m-%d %H:%M:%S")
                cur.execute("""
                    INSERT INTO enroll.enroll_sessions
                        (door_id, unlock_id, event_time_vn, room_label, direction,
                         status, person_count, persons_enrolled)
                    VALUES (%(d)s, %(u)s, %(t)s, %(r)s, %(dir)s, 'processing', 1, 0)
                    RETURNING id
                """, {"d": door_id, "u": str(unlock_id), "t": gate["event_time_vn"],
                      "r": gate["room_label"] or "", "dir": gate["direction"]})
                session_id = str(cur.fetchone()["id"])

            profile_id = _apply_manual_assignment(
                cur, session_id=session_id, door_id=door_id, direction=gate["direction"],
                event_time_vn=gate["event_time_vn"], room_label=gate["room_label"],
                unlock_id=unlock_id, profile_id=profile_id, new_name=new_name,
                new_room=new_room, source=source, user=user,
            )
        conn.commit()
        merged = _auto_merge_room(conn, new_room or gate["room_label"])
    return {"ok": True, "profile_id": profile_id, "enroll_session_id": session_id,
            "auto_merged": merged}


# ── Profiles đã enroll (incoming) cho 1 phòng trong 1 CỬA SỔ PHÒNG ──
# Dùng cho picker khi gán tay outgoing: chỉ hiện người thực sự đã vào phòng
# đó trong cùng cửa sổ phòng (12h trưa → 12h trưa hôm sau) với lượt Ra —
# lượt ra 9h sáng vẫn thấy được khách vào chiều hôm trước.
@router.get("/room-day-profiles")
def room_day_profiles(
    room: str = Query(...),
    ts:   Optional[str] = Query(None, description="ISO timestamp của lượt Ra — xác định cửa sổ phòng"),
    date: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$",
                                description="window_date trực tiếp (fallback khi không có ts)"),
    _=Depends(require_auth),
):
    if not ts and not date:
        raise HTTPException(400, "Cần ts hoặc date")
    if ts:
        window_cond = "enroll.room_window_date(es.event_time_vn) = enroll.room_window_date(%(ts)s::timestamptz)"
        params = {"room": room, "ts": ts}
    else:
        window_cond = "enroll.room_window_date(es.event_time_vn) = %(date)s::date"
        params = {"room": room, "date": date}

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT DISTINCT pp.id, pp.display_name, pp.known_room, pp.confidence_lvl,
                       pp.gender, pp.age_estimate, pp.face_quality,
                       (SELECT ccr.frigate_event_id
                        FROM enroll.person_session_map psm2
                        JOIN enroll.camera_clip_results ccr
                          ON ccr.enroll_session_id = psm2.enroll_session_id
                        WHERE psm2.person_id = pp.id AND ccr.frigate_event_id IS NOT NULL
                        ORDER BY ccr.stopped_here DESC, ccr.confidence DESC NULLS LAST
                        LIMIT 1) AS face_event_id
                FROM enroll.person_profiles pp
                JOIN enroll.person_session_map psm ON psm.person_id = pp.id
                JOIN enroll.enroll_sessions es ON es.id = psm.enroll_session_id
                WHERE pp.is_active
                  AND es.direction = 'incoming'
                  AND es.room_label = %(room)s
                  AND {window_cond}
                ORDER BY pp.display_name NULLS LAST
            """, params)
            return [dict(r) for r in cur.fetchall()]


# ── Gán PHÒNG (không cần chọn người) cho session outgoing ───────
@router.post("/gate-sessions/{door_id}/assign-room")
def assign_gate_session_room(door_id: str, body: dict, user: str = Depends(require_auth)):
    """
    Gán 1 phòng cho session (thường là chiều Ra) — mục đích: THỐNG KÊ phòng
    nào ra/vào lúc nào + có thêm DỮ LIỆU HUẤN LUYỆN. Không đòi hỏi nhận diện
    được người, không quan tâm chất lượng cao/thấp.
      - Gắn nhãn phòng lên gate_session_clips.label để hiển thị ngay ở Gate
        Log và danh sách Phiên.
      - Ghi room_label vào enroll_sessions + đưa lại hàng đợi để worker enroll
        lại lấy dữ liệu huấn luyện cho phòng đã biết (không bắt buộc thành công).
    """
    room = (body.get("known_room") or body.get("room") or "").strip()
    if not room:
        raise HTTPException(400, "known_room là bắt buộc")

    with get_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute("""
                SELECT session_id AS door_id, unlock_id, direction, event_time_vn
                FROM gate_session_clips
                WHERE session_id = %(d)s AND is_best_match = TRUE
                LIMIT 1
            """, {"d": door_id})
            gate = cur.fetchone()
            if not gate:
                raise HTTPException(404, "Gate session not found")

            cur.execute(
                "SELECT id, unlock_id FROM enroll.enroll_sessions WHERE door_id = %(d)s AND direction = %(dir)s",
                {"d": door_id, "dir": gate["direction"]},
            )
            es = cur.fetchone()
            unlock_id = (es["unlock_id"] if es else gate["unlock_id"]) if (es or gate["unlock_id"] is not None) \
                else gate["event_time_vn"].strftime("%Y-%m-%d %H:%M:%S")

            if es:
                session_id = str(es["id"])
                cur.execute("""
                    UPDATE enroll.enroll_sessions
                    SET room_label = %(r)s, status = 'processing',
                        error_msg = NULL, finished_at = NULL
                    WHERE id = %(id)s
                """, {"r": room, "id": session_id})
            else:
                cur.execute("""
                    INSERT INTO enroll.enroll_sessions
                        (door_id, unlock_id, event_time_vn, room_label, direction, status)
                    VALUES (%(d)s, %(u)s, %(t)s, %(r)s, %(dir)s, 'processing')
                    RETURNING id
                """, {"d": door_id, "u": str(unlock_id), "t": gate["event_time_vn"],
                      "r": room, "dir": gate["direction"]})
                session_id = str(cur.fetchone()["id"])

            # Đưa vào hàng đợi để worker f87 enroll lại với phòng đã biết
            cur.execute("""
                INSERT INTO enroll.job_queue
                    (door_id, unlock_id, event_time_vn, room_label, direction,
                     status, scheduled_at)
                VALUES (%(d)s, %(u)s, %(t)s, %(r)s, %(dir)s, 'pending', now())
                ON CONFLICT (door_id, unlock_id, direction) DO UPDATE
                    SET status = 'pending', attempt_count = 0, scheduled_at = now(),
                        room_label = EXCLUDED.room_label, last_error = NULL,
                        locked_by = NULL, locked_at = NULL,
                        started_at = NULL, finished_at = NULL
            """, {"d": door_id, "u": str(unlock_id), "t": gate["event_time_vn"],
                  "r": room, "dir": gate["direction"]})

            # Gắn nhãn phòng lên gate_session_clips → hiện ở Gate Log + Phiên
            _tag_gate_room(cur, door_id, gate["direction"], room)

            cur.execute("""
                INSERT INTO enroll.manual_assignments
                    (door_id, direction, enroll_session_id, person_id, room_label, source, assigned_by)
                VALUES (%(d)s, %(dir)s, %(sid)s, NULL, %(room)s, %(src)s, %(by)s)
            """, {"d": door_id, "dir": gate["direction"], "sid": session_id,
                  "room": room, "src": body.get("source") or "gate_log", "by": user})
        conn.commit()
    return {"ok": True, "enroll_session_id": session_id, "room": room, "requeued": True}


# ── Worker heartbeat status ──────────────────────────────────
@router.get("/worker-status")
def worker_status(_=Depends(require_auth)):
    """Trả về heartbeat của tất cả worker instances."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    worker_id, last_beat, status, active_jobs,
                    max_concurrent, poll_interval_s, hostname, started_at,
                    EXTRACT(EPOCH FROM (now() - last_beat))::int  AS seconds_ago,
                    EXTRACT(EPOCH FROM (now() - started_at))::int AS uptime_s
                FROM enroll.worker_heartbeat
                ORDER BY last_beat DESC
            """)
            return [dict(r) for r in cur.fetchall()]


# ── Release stuck jobs / sessions ───────────────────────────────
@router.post("/release-stuck")
def release_stuck_endpoint(_=Depends(require_auth)):
    """
    Reset jobs kẹt ở 'running' về 'pending' và sessions kẹt ở
    'processing' về 'failed'. Dùng khi worker f87 bị offline.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # 1. Reset job_queue running → pending (tất cả, bất kể thời gian)
            cur.execute("SELECT enroll.release_stuck(0) AS n")
            n_jobs = int(cur.fetchone()["n"] or 0)

            # 2. Reset sessions còn processing mà không có job running nào đang xử lý
            cur.execute("""
                UPDATE enroll.enroll_sessions
                SET status      = 'failed',
                    error_msg   = 'Worker không chạy — reset thủ công',
                    finished_at = now()
                WHERE status = 'processing'
                  AND finished_at IS NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM enroll.job_queue jq
                      WHERE jq.id = job_id AND jq.status = 'running'
                  )
            """)
            n_sessions = cur.rowcount
        conn.commit()
    return {"jobs_reset": n_jobs, "sessions_reset": n_sessions}


# ── Review queue ────────────────────────────────────────────────
@router.get("/review")
def review_queue(
    days:        int = Query(7, ge=1, le=90),
    limit:       int = Query(50, ge=1, le=200),
    offset:      int = Query(0, ge=0),
    min_persons: int = Query(3, ge=2, le=10),
    _=Depends(require_auth),
):
    """
    Sessions cần xử lý thủ công:
      - failed, hoặc enrolled nhưng không gắn được hồ sơ,
      - hoặc phát hiện NHIỀU người (>= min_persons, mặc định 3) trong một
        phiên → nghi ngờ, cần người vận hành xác nhận số người trong phòng.
    """
    where = """
        vs.event_time_vn >= now() - (%(days)s || ' days')::interval
        AND (
            vs.status = 'failed'
            OR (vs.status = 'enrolled' AND vs.recognized_person_id IS NULL)
            OR vs.person_count >= %(min_persons)s
        )
    """
    params_count = {"days": days, "min_persons": min_persons}
    params_list  = {"days": days, "min_persons": min_persons,
                    "limit": limit, "offset": offset}

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT COUNT(*) AS total FROM enroll.v_sessions vs WHERE {where}",
                params_count,
            )
            total = cur.fetchone()["total"]

            cur.execute(f"""
                SELECT vs.id, vs.job_id, vs.door_id, vs.room_label, vs.event_time_vn, vs.status,
                       vs.direction, vs.person_count, vs.persons_enrolled,
                       vs.recognized_person_id, vs.recognition_sim,
                       vs.recognized_name, vs.overall_quality,
                       vs.error_msg, vs.warnings,
                       (SELECT ccr.frigate_event_id
                        FROM enroll.camera_clip_results ccr
                        WHERE ccr.enroll_session_id = vs.id
                          AND ccr.frigate_event_id IS NOT NULL
                        ORDER BY ccr.stopped_here DESC, ccr.confidence DESC NULLS LAST
                        LIMIT 1) AS snap_event_id
                FROM enroll.v_sessions vs
                WHERE {where}
                ORDER BY vs.event_time_vn DESC
                LIMIT %(limit)s OFFSET %(offset)s
            """, params_list)
            items = cur.fetchall()

    return {"items": [dict(r) for r in items], "total": total}


# ── Duplicate clusters ───────────────────────────────────────────
@router.get("/duplicates")
def list_duplicates(
    threshold: float = Query(0.82, ge=0.5, le=0.99),
    _=Depends(require_auth),
):
    """Tìm cặp profile có face_embedding tương tự nhau (potential duplicates)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    a.id           AS id_a,
                    a.display_name AS name_a,
                    a.known_room   AS room_a,
                    a.enroll_count AS cnt_a,
                    a.face_quality AS qual_a,
                    a.gender       AS gender_a,
                    a.age_estimate AS age_a,
                    b.id           AS id_b,
                    b.display_name AS name_b,
                    b.known_room   AS room_b,
                    b.enroll_count AS cnt_b,
                    b.face_quality AS qual_b,
                    b.gender       AS gender_b,
                    b.age_estimate AS age_b,
                    (1 - (a.face_embedding <=> b.face_embedding))::double precision AS similarity,
                    (SELECT ccr.frigate_event_id
                     FROM enroll.person_session_map psm
                     JOIN enroll.camera_clip_results ccr
                       ON ccr.enroll_session_id = psm.enroll_session_id
                     WHERE psm.person_id = a.id AND ccr.frigate_event_id IS NOT NULL
                     ORDER BY ccr.confidence DESC NULLS LAST LIMIT 1) AS face_event_a,
                    (SELECT ccr.frigate_event_id
                     FROM enroll.person_session_map psm
                     JOIN enroll.camera_clip_results ccr
                       ON ccr.enroll_session_id = psm.enroll_session_id
                     WHERE psm.person_id = b.id AND ccr.frigate_event_id IS NOT NULL
                     ORDER BY ccr.confidence DESC NULLS LAST LIMIT 1) AS face_event_b
                FROM enroll.person_profiles a
                JOIN enroll.person_profiles b ON b.id > a.id
                WHERE a.is_active AND b.is_active
                  AND a.face_embedding IS NOT NULL
                  AND b.face_embedding IS NOT NULL
                  AND (1 - (a.face_embedding <=> b.face_embedding)) >= %(thresh)s
                  AND NOT EXISTS (
                      SELECT 1 FROM enroll.duplicate_dismissals dd
                      WHERE dd.profile_id_a = LEAST(a.id, b.id)
                        AND dd.profile_id_b = GREATEST(a.id, b.id)
                  )
                ORDER BY similarity DESC
                LIMIT 100
            """, {"thresh": threshold})
            pairs = cur.fetchall()

    clusters: list = []
    cluster_map: dict = {}

    for row in [dict(r) for r in pairs]:
        if row["cnt_a"] >= row["cnt_b"]:
            p_id, p_name, p_room, p_cnt, p_qual, p_gender, p_age, p_face = (
                row["id_a"], row["name_a"], row["room_a"], row["cnt_a"],
                row["qual_a"], row["gender_a"], row["age_a"], row["face_event_a"])
            s_id, s_name, s_room, s_cnt, s_qual, s_gender, s_age, s_face = (
                row["id_b"], row["name_b"], row["room_b"], row["cnt_b"],
                row["qual_b"], row["gender_b"], row["age_b"], row["face_event_b"])
        else:
            p_id, p_name, p_room, p_cnt, p_qual, p_gender, p_age, p_face = (
                row["id_b"], row["name_b"], row["room_b"], row["cnt_b"],
                row["qual_b"], row["gender_b"], row["age_b"], row["face_event_b"])
            s_id, s_name, s_room, s_cnt, s_qual, s_gender, s_age, s_face = (
                row["id_a"], row["name_a"], row["room_a"], row["cnt_a"],
                row["qual_a"], row["gender_a"], row["age_a"], row["face_event_a"])

        sim = round(float(row["similarity"]), 4)
        cid = str(p_id)

        def _member(mid, mname, mroom, mcnt, mqual, mgender, mage, mface, msim):
            return {
                "id": str(mid), "display_name": mname, "known_room": mroom,
                "enroll_count": mcnt, "face_quality": mqual,
                "gender": mgender, "age_estimate": mage,
                "face_event_id": mface, "similarity": msim,
            }

        if cid in cluster_map:
            idx = cluster_map[cid]
            clusters[idx]["members"].append(
                _member(s_id, s_name, s_room, s_cnt, s_qual, s_gender, s_age, s_face, sim)
            )
            clusters[idx]["max_similarity"] = max(clusters[idx]["max_similarity"], sim)
        else:
            cluster_map[cid] = len(clusters)
            clusters.append({
                "cluster_id": cid,
                "max_similarity": sim,
                "members": [
                    _member(p_id, p_name, p_room, p_cnt, p_qual, p_gender, p_age, p_face, 1.0),
                    _member(s_id, s_name, s_room, s_cnt, s_qual, s_gender, s_age, s_face, sim),
                ],
            })

    return clusters


@router.get("/duplicates/{cluster_id}")
def get_duplicate_cluster(
    cluster_id: str,
    threshold:  float = Query(0.82, ge=0.5, le=0.99),
    _=Depends(require_auth),
):
    """Chi tiết một cluster: primary profile + tất cả profiles tương tự."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, display_name, known_room, confidence_lvl,
                       face_quality, gender, age_estimate, enroll_count,
                       first_seen_ts, last_seen_ts,
                       (SELECT ccr.frigate_event_id
                        FROM enroll.person_session_map psm
                        JOIN enroll.camera_clip_results ccr
                          ON ccr.enroll_session_id = psm.enroll_session_id
                        WHERE psm.person_id = pp.id AND ccr.frigate_event_id IS NOT NULL
                        ORDER BY ccr.confidence DESC NULLS LAST LIMIT 1) AS face_event_id
                FROM enroll.person_profiles pp
                WHERE id = %(cid)s AND is_active
            """, {"cid": cluster_id})
            primary = cur.fetchone()
            if not primary:
                raise HTTPException(404, "Profile not found")

            cur.execute("""
                SELECT b.id, b.display_name, b.known_room, b.confidence_lvl,
                       b.face_quality, b.gender, b.age_estimate, b.enroll_count,
                       b.first_seen_ts, b.last_seen_ts,
                       (1 - (a.face_embedding <=> b.face_embedding))::double precision AS similarity,
                       (SELECT ccr.frigate_event_id
                        FROM enroll.person_session_map psm
                        JOIN enroll.camera_clip_results ccr
                          ON ccr.enroll_session_id = psm.enroll_session_id
                        WHERE psm.person_id = b.id AND ccr.frigate_event_id IS NOT NULL
                        ORDER BY ccr.confidence DESC NULLS LAST LIMIT 1) AS face_event_id
                FROM enroll.person_profiles a
                JOIN enroll.person_profiles b ON b.id != a.id
                WHERE a.id = %(cid)s
                  AND a.is_active AND b.is_active
                  AND a.face_embedding IS NOT NULL
                  AND b.face_embedding IS NOT NULL
                  AND (1 - (a.face_embedding <=> b.face_embedding)) >= %(thresh)s
                ORDER BY similarity DESC
            """, {"cid": cluster_id, "thresh": threshold})
            similars = cur.fetchall()

    p = dict(primary)
    p["similarity"] = 1.0

    return {"cluster_id": cluster_id, "members": [p] + [dict(s) for s in similars]}


@router.post("/profiles/merge")
def merge_profiles(body: dict, _=Depends(require_auth)):
    """
    Gộp nhiều profiles vào một (primary).
    Body: { "primary_id": uuid, "merge_ids": [uuid, ...] }
    """
    primary_id = (body.get("primary_id") or "").strip()
    merge_ids  = [str(m).strip() for m in (body.get("merge_ids") or []) if str(m).strip()]
    if not primary_id or not merge_ids:
        raise HTTPException(400, "primary_id và merge_ids là bắt buộc")

    with get_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM enroll.person_profiles WHERE id = %(pid)s AND is_active",
                {"pid": primary_id},
            )
            if not cur.fetchone():
                raise HTTPException(404, "Primary profile not found")

            # Logic gộp nằm trong enroll.merge_profile_pair — dùng chung với
            # job tự động (merge_room_profiles), kèm audit profile_merge_log.
            merged = 0
            for mid in merge_ids:
                cur.execute(
                    "SELECT enroll.merge_profile_pair(%(primary)s::uuid, %(mid)s::uuid, NULL, 'manual') AS ok",
                    {"primary": primary_id, "mid": mid},
                )
                if cur.fetchone()["ok"]:
                    merged += 1
        conn.commit()

    return {"ok": True, "primary_id": primary_id, "merged": merged}


@router.post("/duplicates/{cluster_id}/dismiss")
def dismiss_duplicate(cluster_id: str, body: dict, _=Depends(require_auth)):
    """
    Đánh dấu cluster không phải trùng lặp — sẽ không hiện lại trong danh sách.
    Body: { "member_ids": [uuid, ...] }
    """
    member_ids = [str(m).strip() for m in (body.get("member_ids") or []) if str(m).strip()]
    if not member_ids:
        raise HTTPException(400, "member_ids là bắt buộc")

    with get_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            for mid in member_ids:
                id_a = str(min(cluster_id, mid))
                id_b = str(max(cluster_id, mid))
                cur.execute("""
                    INSERT INTO enroll.duplicate_dismissals (profile_id_a, profile_id_b)
                    VALUES (%(a)s::uuid, %(b)s::uuid)
                    ON CONFLICT (profile_id_a, profile_id_b) DO NOTHING
                """, {"a": id_a, "b": id_b})
        conn.commit()

    return {"ok": True, "dismissed_pairs": len(member_ids)}


# ── Re-enroll: reset job để worker f87 xử lý lại ────────────────
@router.post("/profiles/{person_id}/re-enroll")
def re_enroll_profile(person_id: str, _=Depends(require_auth)):
    """
    Tạo lại job_queue entries cho tất cả gate events
    đã từng enroll person này. Worker trên f87 sẽ pick up và
    chạy lại pipeline để cải thiện face/appearance data.
    """
    JOB_DELAY_S = 0  # re-enroll từ lịch sử → xử lý ngay

    with get_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute("""
                SELECT es.door_id, es.unlock_id, es.event_time_vn, es.room_label
                FROM enroll.enroll_sessions es
                JOIN enroll.person_session_map psm ON psm.enroll_session_id = es.id
                WHERE psm.person_id = %(pid)s
                ORDER BY es.event_time_vn DESC
            """, {"pid": person_id})
            sessions = cur.fetchall()

            if not sessions:
                raise HTTPException(404, "Không có session nào để re-enroll")

            count = 0
            last_job_id = None
            for ses in sessions:
                cur.execute("""
                    INSERT INTO enroll.job_queue
                        (door_id, unlock_id, event_time_vn, room_label,
                         direction, status, scheduled_at, max_attempts)
                    VALUES (%(d)s,%(u)s,%(t)s,%(r)s,'incoming','pending',now(),3)
                    ON CONFLICT (door_id, unlock_id, direction) DO UPDATE
                        SET status        = 'pending',
                            attempt_count = 0,
                            scheduled_at  = now(),
                            last_error    = NULL,
                            locked_by     = NULL,
                            locked_at     = NULL,
                            started_at    = NULL,
                            finished_at   = NULL
                    RETURNING id
                """, {
                    "d": ses["door_id"], "u": ses["unlock_id"],
                    "t": ses["event_time_vn"], "r": ses["room_label"],
                })
                row = cur.fetchone()
                if row:
                    count += 1
                    last_job_id = row["id"]
        conn.commit()

    return {
        "ok":       True,
        "enqueued": count,
        "job_id":   last_job_id,
        "delay_s":  JOB_DELAY_S,
        "note":     f"Worker f87 sẽ xử lý {count} job(s) trong vài phút tới",
    }
