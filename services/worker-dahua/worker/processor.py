"""
Pipeline xử lý một VideoClip:
    1. Download .dav từ NVR (Dahua NetSDK)
    2. Convert .dav → .mp4 (FFmpeg)
    3. Xóa .dav tạm, cập nhật DB
    4. Retry logic nếu thất bại

Hàm này chạy trong thread của ThreadPoolExecutor.
Mỗi thread có login handle riêng (thread-local trong dahua/client.py).
"""

import os
import time
import threading
import logging
from pathlib import Path
from datetime import datetime

from config import config
from db.models import VideoClip
from db.queries import (
    update_clip_status,
    increment_retry,
    sync_overall_status,
    log_event,
)
from dahua.client import download_clip
from ffmpeg.converter import convert_dav_to_mp4

log = logging.getLogger(__name__)


def process_clip(clip: VideoClip) -> None:
    """Entry point cho mỗi task trong thread pool."""
    tid = threading.current_thread().name

    log.info(
        f"[{tid}] → clip={clip.clip_id[:8]}  "
        f"cam={clip.camera_id}  "
        f"{clip.clip_start.strftime('%H:%M:%S')}→"
        f"{clip.clip_end.strftime('%H:%M:%S')}"
    )

    dav_path = _dav_path(clip)
    mp4_path = _mp4_path(clip)

    update_clip_status(clip.clip_id, 'downloading',
                       worker_id=tid, dav_temp_path=dav_path)

    # ── 1. Download ────────────────────────────────────────────────
    try:
        log_event(clip.clip_id, 'download_start',
                  f"cam={clip.camera_id} retry={clip.retry_count}")

        t0 = time.monotonic()
        download_clip(
            camera_id       = clip.camera_id,
            clip_start      = clip.clip_start,
            clip_end        = clip.clip_end,
            output_path     = dav_path,
            timeout_seconds = _download_timeout(clip),
        )
        elapsed = time.monotonic() - t0

        log_event(clip.clip_id, 'download_ok',
                  f"elapsed={elapsed:.1f}s size={Path(dav_path).stat().st_size:,}B")

    except Exception as exc:
        _handle_failure(clip, 'download_fail', exc)
        return

    # ── 2. Convert ─────────────────────────────────────────────────
    update_clip_status(clip.clip_id, 'converting')

    try:
        log_event(clip.clip_id, 'convert_start')

        t0 = time.monotonic()
        file_size = convert_dav_to_mp4(dav_path, mp4_path)
        elapsed   = time.monotonic() - t0

        log_event(clip.clip_id, 'convert_ok',
                  f"elapsed={elapsed:.1f}s size={file_size:,}B")

    except Exception as exc:
        _handle_failure(clip, 'convert_fail', exc)
        _remove(dav_path)
        return

    # ── 3. Cleanup + DB update ─────────────────────────────────────
    _remove(dav_path)

    update_clip_status(
        clip.clip_id, 'completed',
        mp4_path        = mp4_path,
        file_size_bytes = file_size,
    )
    log_event(clip.clip_id, 'completed',
              f"mp4={mp4_path} size={file_size:,}B")
    sync_overall_status(clip.request_id)

    log.info(
        f"[{tid}] ✓ clip={clip.clip_id[:8]}  "
        f"cam={clip.camera_id}  "
        f"→ {Path(mp4_path).name}  "
        f"({file_size // 1024:,} KB)"
    )


# ── Helpers ────────────────────────────────────────────────────────

def _handle_failure(clip: VideoClip, event_type: str, exc: Exception) -> None:
    msg = str(exc)
    tid = threading.current_thread().name

    log.warning(f"[{tid}] {event_type}  clip={clip.clip_id[:8]}  cam={clip.camera_id}: {msg}")
    log_event(clip.clip_id, event_type, msg)

    will_retry = increment_retry(
        clip_id             = clip.clip_id,
        error_message       = msg,
        max_retries         = config.max_retries,
        retry_delay_seconds = config.retry_delay_seconds,
    )

    if will_retry:
        log.info(
            f"[{tid}] Clip={clip.clip_id[:8]} sẽ retry "
            f"(lần {clip.retry_count + 1}/{config.max_retries}) "
            f"sau {config.retry_delay_seconds}s"
        )
    else:
        log.error(
            f"[{tid}] Clip={clip.clip_id[:8]} FAILED "
            f"sau {config.max_retries} lần thử"
        )
        sync_overall_status(clip.request_id)


def _dav_path(clip: VideoClip) -> str:
    return os.path.join(config.dav_temp_dir, f"{clip.clip_id}.dav")


def _mp4_path(clip: VideoClip) -> str:
    direction = 'IN' if clip.direction == 'incoming' else 'OUT'
    date_str  = clip.clip_start.strftime('%Y%m%d')
    time_str  = clip.clip_start.strftime('%H%M%S')
    filename  = f"{direction}_{clip.camera_id}_{date_str}_{time_str}.mp4"
    return os.path.join(config.video_output_dir, date_str, clip.request_id[:8], filename)


def _download_timeout(clip: VideoClip) -> int:
    """Timeout = thời lượng clip + 90s buffer."""
    clip_duration = int((clip.clip_end - clip.clip_start).total_seconds())
    return clip_duration + 90


def _remove(path: str) -> None:
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError as e:
        log.warning(f"Không xóa được file tạm {path}: {e}")
