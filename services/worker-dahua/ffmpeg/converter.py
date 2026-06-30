"""
Convert .dav → .mp4 bằng FFmpeg.

Chiến lược:
  1. Stream copy (-c copy) — nhanh, không encode lại
  2. Fallback re-encode (libx264) nếu copy thất bại
     (thường xảy ra khi .dav dùng codec H.265 hoặc bị truncated)
"""

import subprocess
import os
import logging
from pathlib import Path

log = logging.getLogger(__name__)

FFMPEG_COPY_CMD = [
    'ffmpeg', '-y',
    '-i', '{input}',
    '-c:v', 'copy',
    '-an',                            # bỏ audio (pcm_alaw không support MP4)
    '-movflags', '+faststart',
    '{output}',
]

FFMPEG_ENCODE_CMD = [
    'ffmpeg', '-y',
    '-i', '{input}',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    '{output}',
]

FFMPEG_TIMEOUT = 300   # giây — đủ cho clip 45s ngay cả khi encode


def convert_dav_to_mp4(dav_path: str, mp4_path: str) -> int:
    """
    Convert dav_path → mp4_path.
    Return file size (bytes) sau khi convert xong.
    Raise RuntimeError nếu cả 2 phương pháp đều thất bại.
    """
    Path(mp4_path).parent.mkdir(parents=True, exist_ok=True)

    # ── Bước 1: Stream copy ──────────────────────────
    if _run(FFMPEG_COPY_CMD, dav_path, mp4_path, label='stream-copy'):
        return _file_size(mp4_path)

    log.warning(f"Stream copy thất bại, fallback re-encode: {Path(dav_path).name}")
    _remove(mp4_path)

    # ── Bước 2: Re-encode ────────────────────────────
    if _run(FFMPEG_ENCODE_CMD, dav_path, mp4_path, label='re-encode'):
        return _file_size(mp4_path)

    raise RuntimeError(
        f"FFmpeg thất bại cả stream-copy lẫn re-encode: {dav_path}"
    )


# ── Helpers ──────────────────────────────────────────────────────────

def _run(cmd_template: list[str], dav: str, mp4: str, label: str) -> bool:
    cmd = [s.replace('{input}', dav).replace('{output}', mp4)
           for s in cmd_template]

    log.debug(f"FFmpeg [{label}]: {' '.join(cmd)}")

    try:
        r = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=FFMPEG_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        log.error(f"FFmpeg [{label}] timeout sau {FFMPEG_TIMEOUT}s")
        _remove(mp4)
        return False

    if r.returncode != 0:
        stderr_tail = r.stderr.decode(errors='replace')[-600:]
        log.warning(f"FFmpeg [{label}] exit={r.returncode}:\n{stderr_tail}")
        _remove(mp4)
        return False

    p = Path(mp4)
    if not p.exists() or p.stat().st_size == 0:
        log.warning(f"FFmpeg [{label}] output rỗng: {mp4}")
        return False

    log.info(
        f"FFmpeg [{label}] OK: {Path(dav).name} → {p.name} "
        f"({p.stat().st_size // 1024:,} KB)"
    )
    return True


def _file_size(path: str) -> int:
    return Path(path).stat().st_size


def _remove(path: str) -> None:
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError:
        pass
