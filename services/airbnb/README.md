# 87TCS — Airbnb Calendar Module

Module độc lập lấy lịch bận/rỗi từ Airbnb cho 12 phòng.
Sau này kết hợp với camera tracking để verify checkin và loại trừ nhiễu.

## Cấu trúc

```
airbnb-calendar/
├── config/
│   └── rooms.yaml          ← Điền 12 airbnb_listing_id + url vào đây
├── db/
│   └── schema.sql          ← Chạy 1 lần để tạo bảng
├── scrapers/
│   └── airbnb_scraper.py   ← Playwright scraper
├── jobs/
│   └── run_daily_scrape.py ← Cronjob chính
├── utils/
│   └── db.py               ← DB helper (dùng lại ở module khác)
└── requirements.txt
```

## Setup

```bash
pip install -r requirements.txt
playwright install chromium

# Tạo bảng trong DB
psql -h localhost -p 5555 -U postgres -d m1087 -f db/schema.sql
```

## Config

Mở `config/rooms.yaml`, điền `airbnb_listing_id` và `airbnb_url` cho 12 phòng.

```yaml
rooms:
  - room_code: "P.301"
    airbnb_listing_id: "1702294736545394440"
    airbnb_url: "https://www.airbnb.com/rooms/1702294736545394440"
```

## Chạy thủ công

```bash
cd airbnb-calendar
PGPASSWORD=yourpassword python -m jobs.run_daily_scrape
```

## Crontab (15h hàng ngày)

```bash
0 15 * * * cd /path/to/airbnb-calendar && PGPASSWORD=xxx python -m jobs.run_daily_scrape >> /var/log/airbnb-calendar.log 2>&1
```

## Logic skip

Job tự động bỏ qua phòng nếu **cả hôm nay lẫn ngày mai đều bận** (is_available = FALSE).
Chỉ scrape khi ít nhất 1 trong 2 ngày còn rỗi — tiết kiệm thời gian và tránh bị Airbnb block.

## Dùng trong camera tracking

```python
from utils.db import CalendarDB
from datetime import date

db = CalendarDB(dsn="...")

# Phòng nào available hôm nay → tầng nào cần track
active_rooms = db.get_active_rooms_today()
# ["P.301", "P.402", "P.601"]

# Check một phòng cụ thể
is_free = db.is_room_available("P.301", date.today())
# True / False / None (chưa có data)
```

## DB Tables

| Table | Mô tả |
|---|---|
| `rooms` | 12 phòng, mapping room_code ↔ airbnb_listing_id |
| `airbnb_calendar` | Lịch bận/rỗi từng ngày, UPSERT mỗi lần scrape |
| `scrape_runs` | Log lịch sử mỗi lần chạy, kể cả skip |
| `v_room_availability` | View tổng hợp tình trạng 30 ngày tới |
| `v_should_scrape` | View để job quyết định phòng nào cần chạy hôm nay |
