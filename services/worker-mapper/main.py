#!/usr/bin/env python3
"""
main.py — Daemon entry point cho worker-mapper.

Chế độ chạy:
  Daemon (Docker / cron):  python main.py
  One-shot test:           python main.py --once [--dry-run] [--hours N] [--since YYYY-MM-DD]
"""

import argparse
import logging
import signal
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")   # load .env nếu có

from config import load_config
from mapper import run_mapper

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [mapper] %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

VN_TZ = timezone(timedelta(hours=7))

_running = True

def _stop(sig, frame):
    global _running
    log.info("Signal received — shutting down after current run...")
    _running = False

signal.signal(signal.SIGTERM, _stop)
signal.signal(signal.SIGINT,  _stop)


def _run_one(cfg, lookback_hours: int, dry_run: bool):
    now_vn   = datetime.now(VN_TZ)
    since_vn = now_vn - timedelta(hours=lookback_hours)
    log.info(f"Run: {since_vn.strftime('%Y-%m-%d %H:%M')} → {now_vn.strftime('%H:%M')} VN | dry_run={dry_run}")
    stats = run_mapper(cfg, since=since_vn, until=now_vn, dry_run=dry_run)
    log.info(
        f"Result: sessions={stats['sessions']} matched={stats['matched']} "
        f"clips={stats['clips']} skipped_active={stats['skipped_active']}"
    )
    return stats


def daemon_loop(cfg):
    log.info(
        f"Daemon start — interval={cfg.interval_sec}s "
        f"lookback={cfg.lookback_hours}h window=±{cfg.window_sec}s "
        f"device={cfg.device_name}"
    )
    while _running:
        t0 = time.monotonic()
        try:
            _run_one(cfg, cfg.lookback_hours, dry_run=False)
        except Exception as e:
            log.error(f"Run failed: {e}", exc_info=True)

        sleep_for = max(0, cfg.interval_sec - (time.monotonic() - t0))
        log.info(f"Next run in {sleep_for:.0f}s")
        # Ngủ từng giây để SIGTERM bắt được nhanh
        deadline = time.monotonic() + sleep_for
        while _running and time.monotonic() < deadline:
            time.sleep(1)

    log.info("Daemon stopped.")


def main():
    parser = argparse.ArgumentParser(description="Gate ↔ Frigate mapper")
    parser.add_argument("--once",    action="store_true", help="Chạy 1 lần rồi thoát")
    parser.add_argument("--dry-run", action="store_true", help="Không ghi DB")
    parser.add_argument("--hours",   type=int,   default=None,
                        help="Lookback N giờ (override MAPPER_LOOKBACK_HOURS)")
    parser.add_argument("--since",   type=str,   default=None,
                        help="Từ ngày cụ thể YYYY-MM-DD (override --hours)")
    args = parser.parse_args()

    cfg = load_config()

    if args.once or args.dry_run or args.since:
        # One-shot mode
        lookback = args.hours or cfg.lookback_hours

        if args.since:
            fmt      = "%Y-%m-%d %H:%M:%S" if " " in args.since else "%Y-%m-%d"
            since_vn = datetime.strptime(args.since, fmt).replace(tzinfo=VN_TZ)
            now_vn   = datetime.now(VN_TZ)
            log.info(f"One-shot: {since_vn.strftime('%Y-%m-%d %H:%M')} → now | dry_run={args.dry_run}")
            stats = run_mapper(cfg, since=since_vn, until=now_vn, dry_run=args.dry_run)
        else:
            stats = _run_one(cfg, lookback, dry_run=args.dry_run)

        log.info(f"Done: {stats}")
        sys.exit(0)
    else:
        daemon_loop(cfg)


if __name__ == "__main__":
    main()
