from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Query, HTTPException, Depends
from fastapi.responses import Response
from ..core.db import get_conn
from ..core.auth import require_auth
from ..core.frigate_session import frigate_mgr

router = APIRouter()
VN_TZ  = timezone(timedelta(hours=7))
PAGE   = 50


@router.get("")
def list_sessions(
    since:     Optional[str] = Query(None),
    until:     Optional[str] = Query(None),
    direction: Optional[str] = Query(None, pattern="^(incoming|outgoing)$"),
    user_name: Optional[str] = Query(None),
    room:      Optional[str] = Query(None),
    limit:     int = Query(PAGE, ge=1, le=500),
    offset:    int = Query(0, ge=0),
    _=Depends(require_auth),
):
    now_vn   = datetime.now(VN_TZ)
    since_dt = datetime.fromisoformat(since).replace(tzinfo=VN_TZ) if since else now_vn - timedelta(hours=24)
    until_dt = datetime.fromisoformat(until).replace(tzinfo=VN_TZ) if until else now_vn

    filters = ["event_time_vn >= %(since)s", "event_time_vn < %(until)s"]
    params  = {"since": since_dt.replace(tzinfo=None), "until": until_dt.replace(tzinfo=None)}

    if direction:
        filters.append("direction = %(direction)s"); params["direction"] = direction
    if user_name:
        filters.append("user_name ILIKE %(user_name)s"); params["user_name"] = f"%{user_name}%"
    if room:
        room_list = [r.strip() for r in room.split(',') if r.strip()]
        filters.append("label = ANY(%(rooms)s)")
        params["rooms"] = room_list

    where = " AND ".join(filters)
    params.update({"limit": limit, "offset": offset})

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT COUNT(*) AS total
                FROM gate_session_clips
                WHERE is_best_match = TRUE AND {where}
            """, params)
            total = cur.fetchone()["total"]

            cur.execute(f"""
                WITH best AS (
                    SELECT *
                    FROM gate_session_clips
                    WHERE is_best_match = TRUE AND {where}
                    ORDER BY event_time_vn DESC
                    LIMIT %(limit)s OFFSET %(offset)s
                )
                SELECT
                    b.session_id, b.unlock_id,
                    (b.event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh') AS event_time_local,
                    b.direction, b.user_name, b.label, b.method, b.camera,
                    b.frigate_event_id, b.frigate_score, b.delta_seconds,
                    b.clip_finalized, b.codec, b.snapshot_url, b.clip_url, b.match_score,
                    -- enroll_key: key để tra enroll session tương ứng
                    -- incoming → unlock_id (text); outgoing → VN-minute bucket
                    CASE WHEN b.direction = 'outgoing'
                         THEN to_char(date_trunc('minute', b.event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD HH24:MI:SS')
                         ELSE b.unlock_id::text
                    END AS enroll_key,
                    (SELECT frigate_event_id FROM gate_session_clips x
                     WHERE x.event_time_vn = b.event_time_vn AND x.direction = b.direction
                       AND x.camera = 'N1' ORDER BY x.match_score ASC LIMIT 1) AS event_id_n1,
                    (SELECT frigate_event_id FROM gate_session_clips x
                     WHERE x.event_time_vn = b.event_time_vn AND x.direction = b.direction
                       AND x.camera = 'S1' ORDER BY x.match_score ASC LIMIT 1) AS event_id_s1,
                    (SELECT frigate_event_id FROM gate_session_clips x
                     WHERE x.event_time_vn = b.event_time_vn AND x.direction = b.direction
                       AND x.camera = 'S2' ORDER BY x.match_score ASC LIMIT 1) AS event_id_s2
                FROM best b
                ORDER BY b.event_time_vn DESC
            """, params)
            items = [dict(r) for r in cur.fetchall()]

    return {"total": total, "offset": offset, "limit": limit, "items": items}


@router.get("/{session_id}")
def get_session_by_id(session_id: int, _=Depends(require_auth)):
    """
    Một session theo door_id — dùng để deep-link từ Enroll sang Gate Log
    (door_id == gate_session_clips.session_id == gate_sessions_v2.door_id)
    mà không phụ thuộc vào trang/filter hiện tại của danh sách Gate Log.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT b.session_id, b.unlock_id,
                    (b.event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh') AS event_time_local,
                    b.direction, b.user_name, b.label, b.method, b.camera,
                    b.frigate_event_id, b.frigate_score, b.delta_seconds,
                    b.clip_finalized, b.codec, b.snapshot_url, b.clip_url, b.match_score,
                    (SELECT frigate_event_id FROM gate_session_clips x
                     WHERE x.session_id = b.session_id AND x.direction = b.direction
                       AND x.camera = 'N1' ORDER BY x.match_score ASC LIMIT 1) AS event_id_n1,
                    (SELECT frigate_event_id FROM gate_session_clips x
                     WHERE x.session_id = b.session_id AND x.direction = b.direction
                       AND x.camera = 'S1' ORDER BY x.match_score ASC LIMIT 1) AS event_id_s1,
                    (SELECT frigate_event_id FROM gate_session_clips x
                     WHERE x.session_id = b.session_id AND x.direction = b.direction
                       AND x.camera = 'S2' ORDER BY x.match_score ASC LIMIT 1) AS event_id_s2
                FROM gate_session_clips b
                WHERE b.session_id = %(sid)s AND b.is_best_match = TRUE
                LIMIT 1
            """, {"sid": session_id})
            row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Session not found")
    return dict(row)


@router.post("/{session_id}/clips/{clip_id}/mark-best", status_code=200)
def mark_best_match(session_id: int, clip_id: int, user: str = Depends(require_auth)):
    """
    Chốt tay (manual override): đặt clip_id làm best_match của session.
    Worker-mapper sẽ không ghi đè lại ở lần chạy sau.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT session_id, event_time_vn, direction FROM gate_session_clips WHERE id = %s",
                (clip_id,),
            )
            row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Clip not found")
        if row["session_id"] != session_id:
            raise HTTPException(400, "Clip does not belong to this session")

        with conn.cursor() as cur:
            # Bỏ chốt cũ (nếu có) trong cùng nhóm session
            cur.execute("""
                UPDATE gate_session_clips
                SET manual_best_match = FALSE,
                    is_best_match     = FALSE
                WHERE session_id    = %(sid)s
                  AND event_time_vn = %(t)s
                  AND direction     = %(d)s
            """, {"sid": row["session_id"], "t": row["event_time_vn"], "d": row["direction"]})

            # Chốt clip mới
            cur.execute("""
                UPDATE gate_session_clips
                SET manual_best_match  = TRUE,
                    is_best_match      = TRUE,
                    manual_reviewed_by = %s,
                    manual_reviewed_at = NOW()
                WHERE id = %s
            """, (user, clip_id))

        conn.commit()

    return {"ok": True, "clip_id": clip_id, "locked_by": user}


@router.delete("/{session_id}/clips/{clip_id}/mark-best", status_code=200)
def unmark_best_match(session_id: int, clip_id: int, _: str = Depends(require_auth)):
    """Bỏ chốt tay — trả về session về chế độ tự động."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM gate_session_clips WHERE id = %s AND session_id = %s",
                (clip_id, session_id),
            )
            if not cur.fetchone():
                raise HTTPException(404, "Clip not found")

            cur.execute("""
                UPDATE gate_session_clips
                SET manual_best_match  = FALSE,
                    manual_reviewed_by = NULL,
                    manual_reviewed_at = NULL
                WHERE id = %s
            """, (clip_id,))

        conn.commit()

    return {"ok": True, "clip_id": clip_id}


@router.get("/{session_id}/clips")
def get_clips(session_id: int, _=Depends(require_auth)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, frigate_event_id, camera, frigate_label, frigate_score,
                    delta_seconds, clip_finalized, codec, snapshot_url, clip_url,
                    match_score, is_best_match, manual_best_match,
                    manual_reviewed_by, manual_reviewed_at,
                    direction, user_name, label, method,
                    (event_start_time AT TIME ZONE 'Asia/Ho_Chi_Minh') AS start_local,
                    (event_end_time   AT TIME ZONE 'Asia/Ho_Chi_Minh') AS end_local
                FROM gate_session_clips
                WHERE session_id = %(sid)s
                ORDER BY match_score ASC
            """, {"sid": session_id})
            rows = cur.fetchall()
    if not rows:
        raise HTTPException(404, "Session not found")
    return [dict(r) for r in rows]


# ── Proxy snapshot — NO auth required (img tag cannot send Bearer) ──────────
# Security: event_id format validation prevents arbitrary path traversal
import re
_EVENT_ID_RE = re.compile(r'^[\d.]+-[a-z0-9]+$')

@router.get("/proxy/snapshot/{event_id}", include_in_schema=False)
async def proxy_snapshot(event_id: str):
    """
    Proxy snapshot.jpg từ Frigate về browser.
    Không cần Bearer token vì <img> tag không thể gửi Authorization header.
    Bảo mật bằng: validate event_id format + backend đã có Frigate session riêng.
    """
    if not _EVENT_ID_RE.match(event_id):
        raise HTTPException(400, "Invalid event_id format")

    try:
        resp = await frigate_mgr.get(f"/api/events/{event_id}/snapshot.jpg")
    except RuntimeError as e:
        raise HTTPException(503, str(e))

    if resp.status_code == 404:
        raise HTTPException(404, "Snapshot not found")
    if resp.status_code != 200:
        raise HTTPException(502, f"Frigate returned {resp.status_code}")

    return Response(
        content=resp.content,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=3600"},
    )
