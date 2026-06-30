"""
Dahua NVR client — mỗi worker thread dùng login handle riêng.

Dùng Python SDK wrapper (NetSDK) thay vì ctypes thô để tránh segfault
khi NVR không accessible hoặc SDK trả về lỗi.

Thread safety:
    - Mỗi thread có handle riêng qua threading.local()
    - _login_lock đảm bảo không login đồng thời từ nhiều threads
"""

import threading
import logging
from datetime import datetime
from pathlib import Path

from config import config
from dahua.sdk_loader import (
    get_sdk,
    NET_TIME,
    fTimeDownLoadPosCallBack,
    DOWNLOAD_COMPLETE,
    DOWNLOAD_ERROR,
)

log = logging.getLogger(__name__)

_tls        = threading.local()
_login_lock = threading.Lock()

# Giữ callback objects để tránh GC trong khi SDK còn dùng
_active_cbs: dict[str, object] = {}
_cbs_lock   = threading.Lock()


# ── Login / Logout ───────────────────────────────────────────────────

def _login() -> int:
    sdk = get_sdk()

    login_id, _device_info, error_msg = sdk.LoginEx2(
        config.nvr_ip,
        config.nvr_port,
        config.nvr_user,
        config.nvr_pass,
    )

    if not login_id:
        raise ConnectionError(
            f"NVR login thất bại — "
            f"IP={config.nvr_ip}:{config.nvr_port} "
            f"error={error_msg}"
        )

    thread_name = threading.current_thread().name
    log.info(f"[{thread_name}] NVR login OK  handle={login_id}")
    return login_id


def _get_handle() -> int:
    if not getattr(_tls, 'handle', None) or _tls.handle <= 0:
        with _login_lock:
            if not getattr(_tls, 'handle', None) or _tls.handle <= 0:
                _tls.handle = _login()
    return _tls.handle


def logout_current_thread() -> None:
    handle = getattr(_tls, 'handle', None)
    if handle and handle > 0:
        try:
            get_sdk().Logout(handle)
            log.info(f"[{threading.current_thread().name}] NVR logout OK")
        except Exception as e:
            log.warning(f"SDK logout error: {e}")
        _tls.handle = None


# ── Download ─────────────────────────────────────────────────────────

def download_clip(
    camera_id:       str,
    clip_start:      datetime,
    clip_end:        datetime,
    output_path:     str,
    timeout_seconds: int = 180,
) -> None:
    """
    Download một clip từ NVR, lưu vào output_path (.dav).
    Blocking — hàm trả về khi download xong hoặc raise exception.
    """
    from dahua.camera_map import get_channel

    channel    = get_channel(camera_id)
    handle     = _get_handle()
    sdk        = get_sdk()
    thread_key = threading.current_thread().name

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    done   = threading.Event()
    result = {'ok': False, 'total': 0}

    @fTimeDownLoadPosCallBack
    def _on_progress(play_handle, total_size, dl_size, index, record_info, user):
        result['total'] = total_size
        if dl_size == DOWNLOAD_COMPLETE:
            result['ok'] = True
            done.set()
        elif dl_size == DOWNLOAD_ERROR:
            result['ok'] = False
            done.set()

    with _cbs_lock:
        _active_cbs[thread_key] = _on_progress

    def _to_net_time(dt) -> NET_TIME:
        return NET_TIME(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second)

    t_start = _to_net_time(clip_start)
    t_end   = _to_net_time(clip_end)

    log.info(
        f"[{thread_key}] Start download  cam={camera_id}(ch={channel})  "
        f"{clip_start.strftime('%H:%M:%S')}→{clip_end.strftime('%H:%M:%S')}  "
        f"→ {output_path}"
    )

    dl_handle = sdk.DownloadByTimeEx(
        handle,
        channel,
        0,              # record type: 0 = ALL
        t_start,
        t_end,
        output_path,
        _on_progress,
        0,
        None,           # data callback
        0,
    )

    if not dl_handle:
        with _cbs_lock:
            _active_cbs.pop(thread_key, None)
        err_msg = sdk.GetLastErrorMessage()
        raise RuntimeError(
            f"CLIENT_DownloadByTimeEx thất bại "
            f"(cam={camera_id} ch={channel} err={err_msg}). "
            f"Kiểm tra: NVR có recording không? Kênh đúng chưa?"
        )

    try:
        finished = done.wait(timeout=timeout_seconds)

        if not finished:
            sdk.StopDownload(dl_handle)
            raise TimeoutError(
                f"Download timeout sau {timeout_seconds}s: cam={camera_id}"
            )

        if not result['ok']:
            sdk.StopDownload(dl_handle)
            raise RuntimeError(
                f"NVR báo lỗi download (DOWNLOAD_ERROR): cam={camera_id}. "
                f"Có thể không có recording trong khoảng thời gian này."
            )

        p = Path(output_path)
        if not p.exists() or p.stat().st_size == 0:
            raise RuntimeError(
                f"File .dav rỗng hoặc không tồn tại sau download: {output_path}"
            )

        log.info(
            f"[{thread_key}] Download OK  cam={camera_id}  "
            f"size={result['total']:,}B  → {Path(output_path).name}"
        )

    finally:
        with _cbs_lock:
            _active_cbs.pop(thread_key, None)
