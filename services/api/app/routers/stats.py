from fastapi import APIRouter, Query, Depends
from ..core.db import get_conn
from ..core.auth import require_auth

router = APIRouter()


@router.get("")
def get_stats(_=Depends(require_auth)):
    sql = """
        SELECT
            COUNT(*)                                                      AS total_sessions,
            COUNT(*) FILTER (WHERE direction = 'incoming')               AS incoming,
            COUNT(*) FILTER (WHERE direction = 'outgoing')               AS outgoing,
            COUNT(*) FILTER (WHERE user_name NOT IN ('Unknown') AND user_name IS NOT NULL) AS known_users,
            COUNT(*) FILTER (WHERE clip_finalized = TRUE)                AS with_clip
        FROM gate_session_clips
        WHERE is_best_match = TRUE
          AND event_time_vn >= NOW() - INTERVAL '24 hours'
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            return dict(cur.fetchone())


@router.get("/trend")
def get_trend(days: int = Query(7, ge=1, le=30), _=Depends(require_auth)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Daily
            cur.execute("""
                SELECT
                    to_char(event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM') AS date,
                    COUNT(*) FILTER (WHERE direction = 'incoming') AS incoming,
                    COUNT(*) FILTER (WHERE direction = 'outgoing') AS outgoing
                FROM gate_session_clips
                WHERE is_best_match = TRUE
                  AND event_time_vn >= NOW() - (%(d)s || ' days')::interval
                GROUP BY 1 ORDER BY MIN(event_time_vn)
            """, {"d": days})
            daily = [dict(r) for r in cur.fetchall()]

            # Hourly today
            cur.execute("""
                SELECT
                    to_char(event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24') AS hour,
                    COUNT(*) FILTER (WHERE direction = 'incoming') AS incoming,
                    COUNT(*) FILTER (WHERE direction = 'outgoing') AS outgoing
                FROM gate_session_clips
                WHERE is_best_match = TRUE
                  AND (event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = CURRENT_DATE
                GROUP BY 1 ORDER BY 1
            """)
            hourly = [dict(r) for r in cur.fetchall()]

            # Phòng ra vào nhiều nhất
            cur.execute("""
                SELECT label AS room,
                    COUNT(*) FILTER (WHERE direction = 'incoming') AS incoming,
                    COUNT(*) FILTER (WHERE direction = 'outgoing') AS outgoing,
                    COUNT(*) AS total,
                    MAX(event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh') AS last_event
                FROM gate_session_clips
                WHERE is_best_match = TRUE
                  AND label ~ '^P\\.\\d{3}$'
                  AND event_time_vn >= NOW() - (%(d)s || ' days')::interval
                GROUP BY label ORDER BY total DESC LIMIT 12
            """, {"d": days})
            top_rooms = []
            for r in cur.fetchall():
                d = dict(r)
                d["last_event"] = d["last_event"].isoformat() if d["last_event"] else None
                top_rooms.append(d)

    return {"daily": daily, "hourly": hourly, "top_rooms": top_rooms}
