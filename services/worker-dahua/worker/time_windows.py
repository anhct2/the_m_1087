"""
Ma trận thời gian cắt video theo hướng di chuyển × camera.

Tất cả clip dài đúng 45 giây.
scheduled_after của request = T + 30s (max offset_end của toàn bộ ma trận).
"""

from datetime import datetime, timedelta

# (direction, camera_id) → (offset_start_sec, offset_end_sec)
TIME_MATRIX: dict[tuple[str, str], tuple[int, int]] = {
    # Hướng VÀO: người đi từ ngoài vào
    ('incoming', 'N1'): (-30, +15),   # camera ngoài: thấy người sớm nhất
    ('incoming', 'S1'): (-20, +25),   # camera giữa
    ('incoming', 'S2'): (-15, +30),   # camera trong: thấy người muộn nhất

    # Hướng RA: người đi từ trong ra
    ('outgoing', 'S2'): (-30, +15),   # camera trong: thấy người sớm nhất
    ('outgoing', 'S1'): (-25, +20),   # camera giữa
    ('outgoing', 'N1'): (-15, +30),   # camera ngoài: thấy người muộn nhất
}

MAX_OFFSET_END = 30  # giây — dùng để tính scheduled_after


def calc_windows(
    direction:   str,
    event_time:  datetime,
) -> dict[str, tuple[datetime, datetime]]:
    """
    Tính clip_start / clip_end cho từng camera.

    Args:
        direction:  'incoming' | 'outgoing'
        event_time: thời điểm xảy ra sự kiện khóa cửa (event_time_vn)

    Returns:
        {'N1': (start, end), 'S1': (start, end), 'S2': (start, end)}
    """
    direction = direction.lower().strip()
    result: dict[str, tuple[datetime, datetime]] = {}

    for (dir_key, cam), (off_start, off_end) in TIME_MATRIX.items():
        if dir_key == direction:
            result[cam] = (
                event_time + timedelta(seconds=off_start),
                event_time + timedelta(seconds=off_end),
            )

    if not result:
        raise ValueError(
            f"Direction không hợp lệ: '{direction}'. "
            f"Cần 'incoming' hoặc 'outgoing'."
        )

    return result
