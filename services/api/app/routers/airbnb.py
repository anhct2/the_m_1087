"""
services/api/app/routers/airbnb.py
Airbnb calendar API — đọc từ bảng rooms + airbnb_calendar (cùng DB m1087).
"""
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from ..core.db import get_conn
from ..core.auth import require_auth

router = APIRouter()


@router.get("/calendar")
def airbnb_calendar(
    days: int = Query(30, ge=7, le=60),
    _=Depends(require_auth),
):
    """
    Trả về lịch bận/rỗi của tất cả Airbnb listings trong N ngày tới.
    Label hiển thị:
      - notes IS NULL và room_code IS NOT NULL  → confirmed → hiển thị room_code
      - notes IS NOT NULL hoặc room_code IS NULL → unverified → hiển thị airbnb_listing_id
    """
    today = date.today()
    end   = today + timedelta(days=days - 1)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Lấy tất cả rooms có Airbnb listing
            cur.execute("""
                SELECT id, room_code, airbnb_listing_id, floor, position, notes
                FROM rooms
                WHERE is_active = TRUE
                  AND airbnb_listing_id IS NOT NULL
                ORDER BY floor NULLS LAST, position NULLS LAST, id
            """)
            rooms_list = [dict(r) for r in cur.fetchall()]

            if not rooms_list:
                dates = [(today + timedelta(days=i)).isoformat() for i in range(days)]
                return {"from_date": today.isoformat(), "to_date": end.isoformat(),
                        "days": days, "dates": dates, "rooms": []}

            room_ids = tuple(r["id"] for r in rooms_list)

            # Lấy calendar data trong khoảng ngày
            cur.execute("""
                SELECT room_id, calendar_date, is_available
                FROM airbnb_calendar
                WHERE room_id IN %s
                  AND calendar_date BETWEEN %s AND %s
                ORDER BY room_id, calendar_date
            """, (room_ids, today, end))
            cal_rows = cur.fetchall()

    # Group calendar by room_id
    cal_map: dict[int, dict[str, bool]] = {}
    for row in cal_rows:
        rid = row["room_id"]
        if rid not in cal_map:
            cal_map[rid] = {}
        cal_map[rid][row["calendar_date"].isoformat()] = row["is_available"]

    dates = [(today + timedelta(days=i)).isoformat() for i in range(days)]

    rooms_out = []
    for r in rooms_list:
        confirmed = (r["notes"] is None) and (r["room_code"] is not None)
        label     = r["room_code"] if confirmed else r["airbnb_listing_id"]
        free_days = sum(1 for d in dates if cal_map.get(r["id"], {}).get(d) is True)
        rooms_out.append({
            "id":         r["id"],
            "room_code":  r["room_code"],
            "listing_id": r["airbnb_listing_id"],
            "label":      label,
            "confirmed":  confirmed,
            "floor":      r["floor"],
            "free_days":  free_days,
            "calendar":   cal_map.get(r["id"], {}),
        })

    return {
        "from_date": today.isoformat(),
        "to_date":   end.isoformat(),
        "days":      days,
        "dates":     dates,
        "rooms":     rooms_out,
    }
