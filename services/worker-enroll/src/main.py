"""
main.py — Worker Enroll Daemon
Chạy trên f87 (192.168.1.200), KHÔNG deploy lên VPS.
Poll job_queue trên VPS HK mỗi POLL_INTERVAL_S giây.
Dùng threading (khớp với psycopg2 sync).
"""
import logging
import os
import signal
import socket
import sys
import threading
import time
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler

from config import (
    POLL_INTERVAL_S, JOB_DELAY_S, OUTGOING_JOB_DELAY_S, MAX_CONCURRENT,
    STUCK_TIMEOUT_M, WORKER_ID, LOG_LEVEL, LOG_FILE,
)
from db import poll_new_gate_events, enqueue, claim_job, release_stuck, upsert_heartbeat
from extractor import Extractor
from pipeline import run_job, run_outgoing_job

log = logging.getLogger(__name__)
_shutdown = threading.Event()
_semaphore = threading.Semaphore(MAX_CONCURRENT)
_active: set = set()
_lock = threading.Lock()


def setup_logging():
    fmt = "%(asctime)s [%(levelname)-8s] %(name)s — %(message)s"
    handlers = [logging.StreamHandler(sys.stdout)]
    if LOG_FILE:
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        handlers.append(RotatingFileHandler(
            LOG_FILE, maxBytes=10*1024*1024, backupCount=5, encoding="utf-8"
        ))
    logging.basicConfig(level=LOG_LEVEL, format=fmt, handlers=handlers)
    logging.getLogger("insightface").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


def handle_signal(sig, frame):
    log.info(f"Signal {sig} — shutting down…")
    _shutdown.set()


def poll_and_enqueue():
    try:
        events = poll_new_gate_events(since_min=15)
        for ev in events:
            direction = ev.get("direction", "incoming")
            delay = OUTGOING_JOB_DELAY_S if direction == "outgoing" else JOB_DELAY_S
            jid = enqueue(ev["door_id"], ev["unlock_id"],
                          ev["event_time_vn"], ev["room_label"], delay,
                          direction=direction)
            if jid:
                log.info(f"Enqueued {direction} job #{jid} {ev['room_label']} @ {ev['event_time_vn']} delay={delay}s")
    except Exception as e:
        log.error(f"poll_and_enqueue error: {e}")


def run_one_job(job: dict):
    jid = job["id"]
    direction = job.get("direction", "incoming")
    with _lock: _active.add(jid)
    try:
        log.info(f"[Job#{jid}] {direction} {job['room_label']} @ {job['event_time_vn']} "
                 f"attempt={job['attempt_count']}")
        kwargs = dict(
            job_id=jid,
            door_id=job["door_id"],
            unlock_id=job["unlock_id"],
            event_time_vn=job["event_time_vn"],
            room_label=job["room_label"],
        )
        if direction == "outgoing":
            run_outgoing_job(**kwargs)
        else:
            run_job(**kwargs)
    except Exception as e:
        log.exception(f"[Job#{jid}] unhandled: {e}")
    finally:
        _semaphore.release()
        with _lock: _active.discard(jid)


def drain_queue():
    while True:
        if not _semaphore.acquire(blocking=False):
            break   # max concurrent reached
        try:
            job = claim_job()
        except Exception as e:
            log.error(f"claim_job error: {e}")
            _semaphore.release()
            break
        if job is None:
            _semaphore.release()
            break
        t = threading.Thread(target=run_one_job, args=(job,), daemon=True)
        t.start()


def _beat(started_at):
    with _lock:
        active = len(_active)
    status = "running" if active > 0 else "idle"
    upsert_heartbeat(
        WORKER_ID, status, active,
        MAX_CONCURRENT, POLL_INTERVAL_S,
        started_at, socket.gethostname(),
    )


def main():
    setup_logging()
    log.info(f"=== worker-enroll {WORKER_ID} starting ===")

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT,  handle_signal)

    started_at = datetime.now(timezone.utc)

    # Reset jobs left in 'running' state from a previous crash before doing anything else
    try:
        n = release_stuck(0)
        if n:
            log.warning(f"Startup: reset {n} stuck jobs from previous crash")
    except Exception as e:
        log.error(f"Startup release_stuck error: {e}")

    # Pre-load GPU model — fail fast
    log.info("Loading ML model…")
    Extractor.get()
    log.info("ML model ready")

    _beat(started_at)  # write initial heartbeat so dashboard shows online quickly

    tick = 0
    while not _shutdown.is_set():
        tick += 1
        if tick % 10 == 0:
            try:
                n = release_stuck()
                if n: log.warning(f"Released {n} stuck jobs")
            except Exception as e:
                log.error(f"release_stuck error: {e}")

        poll_and_enqueue()
        drain_queue()
        _beat(started_at)
        _shutdown.wait(timeout=POLL_INTERVAL_S)

    # Drain active jobs (max 5 min)
    log.info(f"Waiting for {len(_active)} active jobs…")
    for _ in range(300):
        with _lock:
            if not _active: break
        time.sleep(1)

    log.info("=== worker-enroll stopped ===")


if __name__ == "__main__":
    main()
