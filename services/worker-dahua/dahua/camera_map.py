import os

# Map camera_id → NVR channel index (0-based)
# Kiểm tra channel thực tế trong giao diện NVR (DSS/Config Tool)
CAMERA_CHANNELS: dict[str, int] = {
    'N1': int(os.getenv('CAM_N1_CHANNEL', '0')),
    'S1': int(os.getenv('CAM_S1_CHANNEL', '1')),
    'S2': int(os.getenv('CAM_S2_CHANNEL', '2')),
}


def get_channel(camera_id: str) -> int:
    ch = CAMERA_CHANNELS.get(camera_id)
    if ch is None:
        raise ValueError(
            f"Unknown camera_id='{camera_id}'. "
            f"Các camera hợp lệ: {list(CAMERA_CHANNELS.keys())}"
        )
    return ch
