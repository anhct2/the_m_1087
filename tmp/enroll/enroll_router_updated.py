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
    room:   Optional[str] = None,
    status: Optional[str] = None,
    limit:  int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _=Depends(require_auth),
):
    filters = ["1=1"]
    params  = {}
    if room:
        filters.append("room_label = %(room)s")
        params["room"] = room
    if status:
        filters.append("status = %(status)s")
        params["status"] = status
    params.update({"limit": limit, "offset": offset})

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT id, room_label, event_time_vn, status,
                       person_count, persons_enrolled,
                       overall_quality, best_face_score,
                       stopped_at_cam, used_video, total_ms,
                       error_msg, warnings, created_at,
                       direction, user_name, method
                FROM enroll.v_sessions
                WHERE {' AND '.join(filters)}
                ORDER BY event_time_vn DESC
                LIMIT %(limit)s OFFSET %(offset)s
            """, params)
            rows = cur.fetchall()
    return [dict(r) for r in rows]


# ── Session detail ───────────────────────────────────────────────
@router.get("/sessions/{session_id}")
def get_session(session_id: str, _=Depends(require_auth)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM enroll.v_sessions WHERE id = %(sid)s",
                {"sid": session_id}
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "Session not found")

            cur.execute("""
                SELECT camera_id, camera_order, source_type, frames_processed,
                       persons_detected, confidence, face_score,
                       stopped_here, has_multi_person, has_occlusion
                FROM enroll.camera_clip_results
                WHERE enroll_session_id = %(sid)s
                ORDER BY camera_order
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


# ── Profiles list ────────────────────────────────────────────────
@router.get("/profiles")
def list_profiles(
    room:       Optional[str] = None,
    confidence: Optional[str] = None,
    limit:      int = Query(50, ge=1, le=200),
    offset:     int = Query(0, ge=0),
    _=Depends(require_auth),
):
    filters = ["is_active = true"]
    params  = {}
    if room:
        filters.append("known_room = %(room)s")
        params["room"] = room
    if confidence:
        filters.append("confidence_lvl = %(conf)s")
        params["conf"] = confidence
    params.update({"limit": limit, "offset": offset})

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT id, display_name, known_room, confidence_lvl,
                       face_quality, face_source_cam, face_frame_count,
                       age_estimate, gender, appearance_notes,
                       enroll_count, last_seen_ts, body_ratio
                FROM enroll.person_profiles
                WHERE {' AND '.join(filters)}
                ORDER BY last_seen_ts DESC
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
                       enroll_count, first_seen_ts, last_seen_ts, body_ratio
                FROM enroll.person_profiles WHERE id = %(pid)s
            """, {"pid": person_id})
            row = cur.fetchone()
            if not row:
                raise HTTPException(404)

            cur.execute("""
                SELECT es.id, es.room_label, es.event_time_vn, es.status,
                       es.overall_quality, psm.is_new, psm.merge_sim
                FROM enroll.enroll_sessions es
                JOIN enroll.person_session_map psm ON psm.enroll_session_id = es.id
                WHERE psm.person_id = %(pid)s
                ORDER BY es.event_time_vn DESC LIMIT 20
            """, {"pid": person_id})
            sessions = cur.fetchall()

            cur.execute("""
                SELECT room_id, entry_ts, exit_ts, entry_confidence, exit_confidence
                FROM enroll.room_stays WHERE person_id = %(pid)s
                ORDER BY entry_ts DESC
            """, {"pid": person_id})
            stays = cur.fetchall()

    return {
        **dict(row),
        "sessions": [dict(s) for s in sessions],
        "stays":    [dict(s) for s in stays],
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
def get_occupancy(_=Depends(require_auth)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM enroll.v_occupancy")
            return [dict(r) for r in cur.fetchall()]


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
                SELECT id, room_label, event_time_vn, status,
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
    Body: { "days": 7, "room": "P.302" (optional) }
    """
    days = int(body.get("days", 7))
    room = body.get("room", "").strip() or None

    extra = "AND gs.label = %(room)s" if room else ""
    params: dict = {"days": str(days)}
    if room:
        params["room"] = room

    with get_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            # Lấy events chưa có job
            cur.execute(f"""
                SELECT gs.door_id, gs.unlock_id,
                       gs.event_time_vn, gs.label AS room_label
                FROM gate_sessions gs
                WHERE gs.method   = 'password'
                  AND gs.label    LIKE 'P.%%'
                  AND gs.event_time_vn >= now() - (%(days)s || ' days')::interval
                  {extra}
                  AND NOT EXISTS (
                      SELECT 1 FROM enroll.job_queue jq
                      WHERE jq.door_id   = gs.door_id
                        AND jq.unlock_id = gs.unlock_id
                        AND jq.status IN ('pending','running','done')
                  )
            """, params)
            rows = cur.fetchall()

            count = 0
            for r in rows:
                cur.execute("""
                    INSERT INTO enroll.job_queue
                        (door_id, unlock_id, event_time_vn, room_label,
                         status, scheduled_at)
                    VALUES (%(d)s, %(u)s, %(t)s, %(r)s, 'pending', now())
                    ON CONFLICT (door_id, unlock_id) DO NOTHING
                """, {"d": r["door_id"], "u": r["unlock_id"],
                      "t": r["event_time_vn"], "r": r["room_label"]})
                if cur.rowcount:
                    count += 1
        conn.commit()

    return {"enqueued": count, "total_found": len(rows)}


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


# ── Re-enroll: reset job để worker f87 xử lý lại ────────────
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
                         status, scheduled_at, max_attempts)
                    VALUES (%(d)s,%(u)s,%(t)s,%(r)s,'pending',now(),3)
                    ON CONFLICT (door_id, unlock_id) DO UPDATE
                        SET status       = 'pending',
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
