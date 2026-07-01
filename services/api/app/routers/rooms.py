from datetime import date, timedelta
import calendar as cal_mod
from fastapi import APIRouter, Depends, Query
from ..core.db import get_conn
from ..core.auth import require_auth

router = APIRouter()

ROOMS = [f"P.{f}0{r}" for f in range(2, 8) for r in range(1, 3)]


@router.get("/codes")
def room_codes(_=Depends(require_auth)):
    """Danh sách mã phòng — dùng cho bộ lọc checkbox (Gate Log, Enroll)."""
    return ROOMS


@router.get("/status")
def room_status(_=Depends(require_auth)):
    """Trạng thái phòng: chỉ dựa trên events hôm nay.
    occupied = sự kiện gần nhất hôm nay là incoming."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                WITH today_latest AS (
                    SELECT DISTINCT ON (label)
                        label,
                        direction,
                        event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh' AS last_event,
                        user_name
                    FROM gate_sessions_v2
                    WHERE label ~ '^P\\.\\d{3}$'
                      AND (event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh' - INTERVAL '12 hours 1 minute')::date
                          = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh' - INTERVAL '12 hours 1 minute')::date
                    ORDER BY label, event_time_vn DESC
                ),
                today_cnt AS (
                    SELECT label, COUNT(*) AS cnt
                    FROM gate_sessions_v2
                    WHERE label ~ '^P\\.\\d{3}$'
                      AND (event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh' - INTERVAL '12 hours 1 minute')::date
                          = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh' - INTERVAL '12 hours 1 minute')::date
                    GROUP BY label
                )
                SELECT
                    tl.label, tl.direction, tl.last_event, tl.user_name,
                    COALESCE(tc.cnt, 0) AS today_count
                FROM today_latest tl
                LEFT JOIN today_cnt tc ON tc.label = tl.label
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


@router.get("/monthly")
def room_monthly(
    year:  int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    _=Depends(require_auth),
):
    """Heatmap lịch phòng theo "ngày khách sạn":
    Ngày D = khoảng 12:01 ngày D → 12:00 ngày D+1.
    Công thức: hotel_day = (event_time - 12h01m)::date
    """
    first_day = date(year, month, 1)
    last_day  = date(year, month, cal_mod.monthrange(year, month)[1])

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    label,
                    (event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh'
                        - INTERVAL '12 hours 1 minute')::date AS hotel_day,
                    COUNT(*) AS ev_count
                FROM gate_sessions_v2
                WHERE direction = 'incoming'
                  AND label ~ '^P\\.\\d{3}$'
                  AND (event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh'
                        - INTERVAL '12 hours 1 minute')::date
                      BETWEEN %(first_day)s AND %(last_day)s
                GROUP BY label, hotel_day
                ORDER BY label, hotel_day
            """, {"first_day": first_day, "last_day": last_day})
            rows = cur.fetchall()

    room_map: dict[str, dict] = {r: {} for r in ROOMS}
    for row in rows:
        room = row["label"]
        if room in room_map:
            room_map[room][row["hotel_day"].isoformat()] = {
                "busy":  True,
                "count": int(row["ev_count"]),
            }

    return {
        "year":          year,
        "month":         month,
        "days_in_month": cal_mod.monthrange(year, month)[1],
        "rooms": [
            {"room": room, "days": room_map[room]}
            for room in ROOMS
        ],
    }


@router.get("/{room}/day")
def room_day(
    room: str,
    date_str: str = Query(..., alias="date", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    _=Depends(require_auth),
):
    """Trả về danh sách sự kiện của một phòng trong một ngày cụ thể."""
    try:
        d = date.fromisoformat(date_str)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(400, "Invalid date format")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    g.direction, g.user_name, g.method,
                    (g.event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh') AS event_time,
                    (
                        SELECT x.frigate_event_id
                        FROM gate_session_clips x
                        WHERE x.event_time_vn = g.event_time_vn
                          AND x.direction     = g.direction
                          AND x.camera        = 'N1'
                        ORDER BY x.match_score ASC
                        LIMIT 1
                    ) AS event_id_n1
                FROM gate_sessions_v2 g
                WHERE g.label = %(room)s
                  AND (g.event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh')
                      >= %(day)s::date + INTERVAL '12 hours 1 minute'
                  AND (g.event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh')
                      <  %(day)s::date + INTERVAL '1 day 12 hours 1 minute'
                ORDER BY g.event_time_vn
            """, {"room": room, "day": d})
            events = cur.fetchall()

    return {
        "room": room,
        "date": date_str,
        "events": [
            {
                "direction":  e["direction"],
                "user_name":  e["user_name"],
                "method":     e["method"],
                "event_time": e["event_time"].isoformat() if e["event_time"] else None,
                "event_id_n1": e["event_id_n1"],
            }
            for e in events
        ],
    }


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
                FROM gate_sessions_v2 g
                WHERE g.label = %(room)s
                ORDER BY g.event_time_vn DESC
                LIMIT %(limit)s
            """, {"room": room, "limit": limit})
            events = cur.fetchall()

            cur.execute("""
                SELECT
                    COUNT(*) FILTER (WHERE direction = 'incoming') AS total_in,
                    COUNT(*) FILTER (WHERE direction = 'outgoing') AS total_out
                FROM gate_sessions_v2
                WHERE label = %(room)s
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
