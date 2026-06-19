from fastapi import APIRouter, Depends, Query
from ..core.db import get_conn
from ..core.auth import require_auth

router = APIRouter()

ROOMS = [f"P.{f}0{r}" for f in range(2, 8) for r in range(1, 3)]


@router.get("/status")
def room_status(_=Depends(require_auth)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                WITH latest AS (
                    SELECT DISTINCT ON (label)
                        label,
                        direction,
                        event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh' AS last_event,
                        user_name
                    FROM gate_session_clips
                    WHERE is_best_match = TRUE
                      AND label ~ '^P\\.\\d{3}$'
                    ORDER BY label, event_time_vn DESC
                ),
                today_cnt AS (
                    SELECT label, COUNT(*) AS cnt
                    FROM gate_session_clips
                    WHERE is_best_match = TRUE
                      AND label ~ '^P\\.\\d{3}$'
                      AND (event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = CURRENT_DATE
                    GROUP BY label
                )
                SELECT
                    l.label, l.direction, l.last_event, l.user_name,
                    COALESCE(tc.cnt, 0) AS today_count
                FROM latest l
                LEFT JOIN today_cnt tc ON tc.label = l.label
            """)
            rows = {r["label"]: dict(r) for r in cur.fetchall()}

    result = []
    for room in ROOMS:
        data = rows.get(room)
        result.append({
            "room": room,
            "floor": int(room[2]),
            "occupied": data["direction"] == "incoming" if data else False,
            "last_direction": data["direction"] if data else None,
            "last_event": data["last_event"].isoformat() if data and data["last_event"] else None,
            "last_user": data["user_name"] if data else None,
            "today_count": int(data["today_count"]) if data else 0,
        })
    return result


@router.get("/{room}/history")
def room_history(
    room: str,
    limit: int = Query(100, ge=1, le=500),
    _=Depends(require_auth),
):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    g.direction, g.user_name, g.method,
                    g.event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh' AS event_time,
                    (
                        SELECT x.frigate_event_id
                        FROM gate_session_clips x
                        WHERE x.event_time_vn = g.event_time_vn
                          AND x.direction     = g.direction
                          AND x.camera        = 'N1'
                        ORDER BY x.match_score ASC
                        LIMIT 1
                    ) AS event_id_n1
                FROM gate_session_clips g
                WHERE g.is_best_match = TRUE
                  AND g.label = %(room)s
                ORDER BY g.event_time_vn DESC
                LIMIT %(limit)s
            """, {"room": room, "limit": limit})
            events = cur.fetchall()

            cur.execute("""
                SELECT
                    COUNT(*) FILTER (WHERE direction = 'incoming') AS total_in,
                    COUNT(*) FILTER (WHERE direction = 'outgoing') AS total_out
                FROM gate_session_clips
                WHERE is_best_match = TRUE AND label = %(room)s
            """, {"room": room})
            totals = dict(cur.fetchone())

    return {
        "room": room,
        "total_in": int(totals["total_in"]),
        "total_out": int(totals["total_out"]),
        "events": [
            {
                "direction": e["direction"],
                "user_name": e["user_name"],
                "method": e["method"],
                "event_time": e["event_time"].isoformat() if e["event_time"] else None,
                "event_id_n1": e["event_id_n1"],
            }
            for e in events
        ],
    }
