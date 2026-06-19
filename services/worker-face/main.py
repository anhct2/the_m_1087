#!/usr/bin/env python3
"""
worker-face/main.py — Face recognition pipeline (SCAFFOLD)

Status: disabled by default (FACE_ENABLED=false)
Enable: set FACE_ENABLED=true + COMPREFACE_URL + COMPREFACE_KEY in .env

Pipeline (when enabled):
  1. Poll gate_session_clips for rows without face_label (new snapshots)
  2. Download snapshot from Frigate
  3. Send to CompreFace /api/v1/recognition/recognize
  4. Write result back to gate_session_clips.face_label + face_confidence
  5. Sleep FACE_INTERVAL_SEC

To enable CompreFace:
  - Add CompreFace to docker-compose.yml (see docs/face-recognition.md)
  - Run: docker compose --profile face up
"""

import os
import time
import logging
import signal

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [face] %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

FACE_ENABLED   = os.getenv("FACE_ENABLED", "false").lower() == "true"
COMPREFACE_URL = os.getenv("COMPREFACE_URL", "")
COMPREFACE_KEY = os.getenv("COMPREFACE_KEY", "")
INTERVAL       = int(os.getenv("FACE_INTERVAL_SEC", "60"))

_running = True
def _stop(sig, frame):
    global _running
    _running = False

signal.signal(signal.SIGTERM, _stop)
signal.signal(signal.SIGINT,  _stop)


def run_once():
    # TODO: implement face recognition pipeline
    # from recognizer import run_recognition
    # run_recognition(...)
    log.debug("Face worker tick (not yet implemented)")


def main():
    if not FACE_ENABLED:
        log.info("Face recognition disabled (FACE_ENABLED=false). Sleeping indefinitely.")
        while _running:
            time.sleep(10)
        return

    if not COMPREFACE_URL or not COMPREFACE_KEY:
        log.error("FACE_ENABLED=true but COMPREFACE_URL or COMPREFACE_KEY not set. Exiting.")
        return

    log.info(f"Face worker starting — CompreFace: {COMPREFACE_URL} interval={INTERVAL}s")

    while _running:
        try:
            run_once()
        except Exception as e:
            log.error(f"Face run failed: {e}", exc_info=True)
        time.sleep(INTERVAL)

    log.info("Face worker stopped.")


if __name__ == "__main__":
    main()
