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
    days:  int = Query(30, ge=7, le=90),
    month: int = Query(None, ge=1, le=12),
    year:  int = Query(None, ge=2020, le=2099),
    _=Depends(require_auth),
):
    """
    Trả về lịch bận/rỗi của tất cả Airbnb listings.
    - month + year → trả về cả tháng đó (kể cả ngày đã qua)
    - chỉ days     → N ngày từ hôm nay
    """
    today = date.today()
    if month is not None and year is not None:
        from_date = date(year, month, 1)
        to_date   = date(year + (month // 12), month % 12 + 1, 1) - timedelta(days=1)
    else:
        from_date = today
        to_date   = today + timedelta(days=days - 1)

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
                n = (to_date - from_date).days + 1
                dates = [(from_date + timedelta(days=i)).isoformat() for i in range(n)]
                return {"from_date": from_date.isoformat(), "to_date": to_date.isoformat(),
                        "dates": dates, "rooms": []}

            room_ids = tuple(r["id"] for r in rooms_list)

            cur.execute("""
                SELECT room_id, calendar_date, is_available
                FROM airbnb_calendar
                WHERE room_id IN %s
                  AND calendar_date BETWEEN %s AND %s
                ORDER BY room_id, calendar_date
            """, (room_ids, from_date, to_date))
            cal_rows = cur.fetchall()

    # Group calendar by room_id
    cal_map: dict[int, dict[str, bool]] = {}
    for row in cal_rows:
        rid = row["room_id"]
        if rid not in cal_map:
            cal_map[rid] = {}
        cal_map[rid][row["calendar_date"].isoformat()] = row["is_available"]

    n     = (to_date - from_date).days + 1
    dates = [(from_date + timedelta(days=i)).isoformat() for i in range(n)]

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
        "from_date": from_date.isoformat(),
        "to_date":   to_date.isoformat(),
        "dates":     dates,
        "rooms":     rooms_out,
    }
