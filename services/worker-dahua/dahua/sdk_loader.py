"""
Dahua NetSDK loader — dùng Python SDK wrapper (NetSDK package).

Cài đặt: pip install sdk/linux64/NetSDK-2.0.0.1-py3-none-linux_x86_64.whl
Tham khảo: Dahua NetSDK-2.0.0.1
"""

import logging
from pathlib import Path

log = logging.getLogger(__name__)

from NetSDK.NetSDK import NetClient
from NetSDK.SDK_Struct import NET_TIME, NET_RECORDFILE_INFO
from NetSDK.SDK_Callback import fTimeDownLoadPosCallBack
from NetSDK.SDK_Enum import EM_LOGIN_SPAC_CAP_TYPE

# Re-export để client.py dùng
__all__ = [
    'NET_TIME', 'NET_RECORDFILE_INFO', 'fTimeDownLoadPosCallBack',
    'DOWNLOAD_COMPLETE', 'DOWNLOAD_ERROR',
    'load_sdk', 'get_sdk',
]

# Giá trị callback báo trạng thái download
DOWNLOAD_COMPLETE = 0xFFFFFFFF   # (uint32) -1 → download xong
DOWNLOAD_ERROR    = 0xFFFFFFFE   # (uint32) -2 → NVR error / disk full

_sdk: NetClient | None = None


def load_sdk(lib_path: str) -> NetClient:
    """
    Khởi tạo Dahua NetClient.
    lib_path không dùng trực tiếp (NetSDK tự tìm .so theo platform),
    nhưng kiểm tra thư mục để đảm bảo .so files đã được deploy.
    """
    global _sdk
    if _sdk is not None:
        return _sdk

    sdk_dir = Path(lib_path).parent
    if not sdk_dir.exists():
        raise FileNotFoundError(f"SDK directory not found: {sdk_dir}")

    _sdk = NetClient()
    log.info(f"Dahua SDK (NetClient) loaded")
    return _sdk


def get_sdk() -> NetClient:
    if _sdk is None:
        raise RuntimeError("SDK chưa được load. Gọi load_sdk() trước.")
    return _sdk
