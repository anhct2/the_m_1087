"""
87TCS — Airbnb Calendar Cronjob
Chạy lúc 15:00 hàng ngày.

Crontab:
    0 15 * * * cd /path/to/services/airbnb && PGPASSWORD=xxx python -m jobs.run_daily_scrape >> /var/log/airbnb-calendar.log 2>&1
"""

import os
import sys
import logging
import random
import time
import yaml
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from scrapers.airbnb_scraper import AirbnbCalendarScraper
from utils.db import CalendarDB

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def load_config() -> dict:
    with open(ROOT / "config" / "rooms.yaml") as f:
        return yaml.safe_load(f)


def build_dsn(cfg: dict) -> str:
    db   = cfg["database"]
    host = os.getenv("POSTGRES_HOST", db["host"])
    port = os.getenv("POSTGRES_PORT", str(db["port"]))
    name = os.getenv("POSTGRES_DB",   db["name"])
    user = os.getenv("POSTGRES_USER", db["user"])
    pw   = os.getenv("POSTGRES_PASS", os.getenv("PGPASSWORD", db.get("password", "")))
    return f"host={host} port={port} dbname={name} user={user} password={pw}"


def run():
    logger.info("=" * 60)
    logger.info(f"[Job] BẮT ĐẦU — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info("=" * 60)

    cfg     = load_config()
    db      = CalendarDB(build_dsn(cfg))
    rooms   = db.get_rooms_to_scrape()

    logger.info(f"[Job] {len(rooms)} phòng có Airbnb listing")

    scraper_cfg = cfg.get("scraper", {})
    scraper = AirbnbCalendarScraper(
        headless   = scraper_cfg.get("headless", True),
        timeout_ms = scraper_cfg.get("timeout_ms", 40000),
    )

    stats = {"run": 0, "skip": 0, "error": 0}

    for idx, room in enumerate(rooms):
        label      = room["room_code"] or room["airbnb_listing_id"]
        room_id    = room["room_id"]
        should_run = room["should_run"]
        skip_rsn   = room["skip_reason"]

        if not should_run:
            logger.info(f"[{label}] SKIP — {skip_rsn}")
            run_id = db.start_run(room_id, "cron", room["today_available"], room["tomorrow_available"])
            db.finish_run(run_id, status="skipped", skip_reason=skip_rsn)
            stats["skip"] += 1
        else:
            logger.info(f"[{label}] SCRAPING — today={room['today_available']} tomorrow={room['tomorrow_available']}")
            run_id = db.start_run(room_id, "cron", room["today_available"], room["tomorrow_available"])
            try:
                calendar = scraper.scrape(room["airbnb_url"])
                if not calendar:
                    raise ValueError("Scraper trả về rỗng — có thể bị block hoặc URL sai")

                changed = db.upsert_calendar(room_id, run_id, calendar)
                db.finish_run(run_id, status="success", days_fetched=len(calendar), days_updated=changed)
                logger.info(f"[{label}] OK — {len(calendar)} ngày, {changed} ngày thay đổi")
                stats["run"] += 1

            except Exception as e:
                logger.error(f"[{label}] LỖI — {e}")
                db.finish_run(run_id, status="failed", error=str(e))
                stats["error"] += 1

        # Delay ngẫu nhiên 5–15 phút giữa các phòng (tránh Airbnb detect)
        if idx < len(rooms) - 1:
            delay_s = random.uniform(5 * 60, 15 * 60)
            logger.info(f"[Job] Chờ {delay_s / 60:.1f} phút trước phòng tiếp theo...")
            time.sleep(delay_s)

    logger.info("-" * 60)
    logger.info(f"[Job] XONG — chạy: {stats['run']} | skip: {stats['skip']} | lỗi: {stats['error']}")


if __name__ == "__main__":
    run()
