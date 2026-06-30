"""
worker-dahua — entry point.

Khởi động:
    python -u main.py

Hoặc qua Docker:
    docker-compose -f docker-compose.dahua.yml up
"""

import logging
import os
import signal
import sys
import time

from apscheduler.schedulers.background import BackgroundScheduler

from config import config
from db.connection import init_pool
from dahua.sdk_loader import load_sdk, get_sdk
from worker.poller import run_poller
from worker.scheduler import init_executor, shutdown_executor, run_scheduler

# ── Logging ──────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s  %(levelname)-8s  %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    stream=sys.stdout,
)
log = logging.getLogger('worker-dahua')

# ── Graceful shutdown ─────────────────────────────────────────────────
_running = True


def _on_signal(sig, _frame):
    global _running
    log.info(f"Signal {sig} nhận được → đang shutdown...")
    _running = False


signal.signal(signal.SIGTERM, _on_signal)
signal.signal(signal.SIGINT,  _on_signal)


# ── Main ──────────────────────────────────────────────────────────────
def main() -> None:
    log.info("=" * 60)
    log.info("worker-dahua khởi động")
    log.info(f"  NVR            : {config.nvr_ip}:{config.nvr_port}")
    log.info(f"  DB             : {config.db_url[:50]}...")
    log.info(f"  Max workers    : {config.max_workers}")
    log.info(f"  Poll interval  : {config.poll_interval_seconds}s")
    log.info(f"  Video output   : {config.video_output_dir}")
    log.info(f"  DAV temp       : {config.dav_temp_dir}")
    log.info(f"  SDK            : {config.sdk_lib_path}")
    log.info("=" * 60)

    # Tạo thư mục cần thiết
    for d in (config.video_output_dir, config.dav_temp_dir):
        os.makedirs(d, exist_ok=True)

    # ── DB pool ─────────────────────────────────────────────────────
    init_pool(minconn=2, maxconn=config.max_workers + 4)
    log.info("DB pool OK")

    # ── Dahua SDK ───────────────────────────────────────────────────
    sdk = load_sdk(config.sdk_lib_path)
    sdk.InitEx()
    log.info("Dahua SDK OK")

    # ── Thread pool ─────────────────────────────────────────────────
    init_executor(config.max_workers)

    # ── APScheduler ─────────────────────────────────────────────────
    scheduler = BackgroundScheduler(
        timezone='Asia/Ho_Chi_Minh',
        job_defaults={'coalesce': True, 'max_instances': 1},
    )

    scheduler.add_job(
        run_poller,
        trigger='interval',
        seconds=config.poll_interval_seconds,
        id='poller',
        name='Poller: scan gate_sessions',
    )

    scheduler.add_job(
        run_scheduler,
        trigger='interval',
        seconds=config.scheduler_interval_seconds,
        id='scheduler',
        name='Scheduler: dispatch ready clips',
    )

    scheduler.start()
    log.info(
        f"Scheduler chạy: poller/{config.poll_interval_seconds}s  "
        f"scheduler/{config.scheduler_interval_seconds}s"
    )

    # Chạy ngay lần đầu, không đợi interval
    log.info("Chạy poller lần đầu...")
    run_poller()

    # ── Main loop ────────────────────────────────────────────────────
    while _running:
        time.sleep(1)

    # ── Shutdown ─────────────────────────────────────────────────────
    log.info("Dừng scheduler...")
    scheduler.shutdown(wait=False)

    # Cleanup SDK trước để NVR giải phóng connection ngay,
    # đồng thời unblock các thread đang chờ download
    log.info("Cleanup SDK (logout NVR)...")
    try:
        get_sdk().Cleanup()
    except Exception:
        pass

    log.info("Dừng worker pool...")
    shutdown_executor(wait=False)

    log.info("worker-dahua đã dừng.")


if __name__ == '__main__':
    main()
