"""
Tất cả SQL queries cho worker-dahua.

NOTE: gate_sessions_v2 là VIEW trong schema hiện có.
Điều chỉnh tên cột nếu cần cho phù hợp với schema thực tế.
"""

import json
import uuid
import logging
from datetime import datetime, timedelta
from typing import Optional

from db.connection import db_cursor
from db.models import VideoClip

log = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────
# Poller queries
# ─────────────────────────────────────────────────────────────────────

def get_unprocessed_sessions() -> list[dict]:
    """
    Lấy các gate_session chưa có video_extraction_request.
    Giới hạn 2 giờ gần nhất để tránh xử lý sự kiện cũ.
    """
    with db_cursor() as cur:
        cur.execute("""
            SELECT
                gs.door_id::text,
                gs.event_time_vn,
                gs.direction
            FROM gate_sessions_v2 gs
            LEFT JOIN video_extraction_requests ver
                ON ver.session_id = gs.door_id::text
            WHERE ver.request_id IS NULL
              AND gs.event_time_vn IS NOT NULL
              AND gs.direction     IS NOT NULL
              AND gs.event_time_vn >= NOW() - INTERVAL '2 hours'
            ORDER BY gs.event_time_vn DESC
            LIMIT 50
        """)
        return [
            {
                'session_id':    str(r[0]),
                'event_time_vn': r[1],
                'direction':     str(r[2]).lower(),
            }
            for r in cur.fetchall()
        ]


def create_extraction_request(
    session_id:    str,
    event_time_vn: datetime,
    direction:     str,
) -> Optional[str]:
    """
    Insert video_extraction_request + 3 video_clips.
    ON CONFLICT DO NOTHING để idempotent.
    Return request_id nếu tạo mới, None nếu đã tồn tại.
    """
    from worker.time_windows import calc_windows

    request_id      = str(uuid.uuid4())
    scheduled_after = event_time_vn + timedelta(seconds=30)
    windows         = calc_windows(direction, event_time_vn)

    with db_cursor() as cur:
        cur.execute("""
            INSERT INTO video_extraction_requests
                (request_id, session_id, event_time_vn, direction, scheduled_after)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (session_id) DO NOTHING
            RETURNING request_id
        """, (request_id, session_id, event_time_vn, direction, scheduled_after))

        row = cur.fetchone()
        if not row:
            return None   # đã tồn tại

        actual_id = str(row[0])

        for camera_id, (clip_start, clip_end) in windows.items():
            cur.execute("""
                INSERT INTO video_clips
                    (clip_id, request_id, camera_id, clip_start, clip_end)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (request_id, camera_id) DO NOTHING
            """, (str(uuid.uuid4()), actual_id, camera_id, clip_start, clip_end))

        return actual_id


# ─────────────────────────────────────────────────────────────────────
# Scheduler queries
# ─────────────────────────────────────────────────────────────────────

def get_ready_clips(limit: int = 4) -> list[VideoClip]:
    """
    Atomic SELECT … FOR UPDATE SKIP LOCKED → UPDATE status='downloading'.
    Không thể bị 2 worker cùng lấy 1 clip.
    """
    with db_cursor() as cur:
        cur.execute("""
            WITH locked AS (
                SELECT clip_id, request_id
                FROM   video_clips
                WHERE  status = 'pending'
                  AND  clip_end <= NOW()
                  AND  (retry_after IS NULL OR retry_after <= NOW())
                ORDER BY clip_end
                LIMIT %s
                FOR UPDATE SKIP LOCKED
            )
            UPDATE video_clips vc
            SET    status     = 'downloading',
                   started_at = NOW(),
                   updated_at = NOW()
            FROM   locked,
                   video_extraction_requests ver
            WHERE  vc.clip_id      = locked.clip_id
              AND  ver.request_id  = locked.request_id
            RETURNING
                vc.clip_id, vc.request_id, vc.camera_id,
                vc.clip_start, vc.clip_end, vc.retry_count,
                ver.direction
        """, (limit,))

        return [
            VideoClip(
                clip_id    = str(r[0]),
                request_id = str(r[1]),
                camera_id  = r[2],
                clip_start = r[3],
                clip_end   = r[4],
                status     = 'downloading',
                retry_count= r[5],
                direction  = str(r[6]),
            )
            for r in cur.fetchall()
        ]


# ─────────────────────────────────────────────────────────────────────
# Processor queries
# ─────────────────────────────────────────────────────────────────────

def update_clip_status(clip_id: str, status: str, **kwargs) -> None:
    """Cập nhật status + các trường tuỳ chọn."""
    set_parts = ['status = %s', 'updated_at = NOW()']
    values    = [status]

    for col in ('dav_temp_path', 'mp4_path', 'file_size_bytes',
                'error_message', 'worker_id'):
        if col in kwargs:
            set_parts.append(f'{col} = %s')
            values.append(kwargs[col])

    if status == 'converting':
        pass
    elif status in ('completed', 'failed'):
        set_parts.append('completed_at = NOW()')

    values.append(clip_id)

    with db_cursor() as cur:
        cur.execute(
            f"UPDATE video_clips SET {', '.join(set_parts)} WHERE clip_id = %s",
            values,
        )


def increment_retry(
    clip_id:            str,
    error_message:      str,
    max_retries:        int,
    retry_delay_seconds: int,
) -> bool:
    """
    Tăng retry_count.
    - Nếu chưa đạt max → status='pending', retry_after=NOW()+delay
    - Nếu đạt max      → status='failed'
    Return True nếu sẽ được retry lại.
    """
    with db_cursor() as cur:
        cur.execute("""
            UPDATE video_clips
            SET retry_count   = retry_count + 1,
                error_message = %s,
                status = CASE
                    WHEN retry_count + 1 >= %s THEN 'failed'::video_status
                    ELSE 'pending'::video_status
                END,
                retry_after = CASE
                    WHEN retry_count + 1 < %s
                    THEN NOW() + (%s || ' seconds')::INTERVAL
                    ELSE NULL
                END,
                updated_at = NOW()
            WHERE clip_id = %s
            RETURNING status
        """, (error_message, max_retries, max_retries, str(retry_delay_seconds), clip_id))

        row = cur.fetchone()
        return bool(row and row[0] == 'pending')


def sync_overall_status(request_id: str) -> None:
    """Cập nhật overall_status của request dựa vào trạng thái 3 clips."""
    with db_cursor() as cur:
        cur.execute("""
            WITH stats AS (
                SELECT
                    COUNT(*)                                    AS total,
                    COUNT(*) FILTER (WHERE status = 'completed') AS done,
                    COUNT(*) FILTER (WHERE status = 'failed')    AS failed,
                    COUNT(*) FILTER (
                        WHERE status IN ('downloading','converting')
                    )                                           AS active
                FROM video_clips
                WHERE request_id = %s
            )
            UPDATE video_extraction_requests
            SET overall_status = (
                SELECT CASE
                    WHEN done  = total                         THEN 'completed'
                    WHEN active > 0                            THEN 'processing'
                    WHEN failed > 0 AND done > 0               THEN 'partial_failed'
                    WHEN failed = total                        THEN 'failed'
                    ELSE overall_status
                END
                FROM stats
            ),
            updated_at = NOW()
            WHERE request_id = %s
        """, (request_id, request_id))


def log_event(
    clip_id:    str,
    event_type: str,
    message:    str = '',
    metadata:   dict | None = None,
) -> None:
    """Ghi vào video_worker_logs."""
    meta_json = json.dumps(metadata) if metadata else None
    with db_cursor() as cur:
        cur.execute("""
            INSERT INTO video_worker_logs (clip_id, event_type, message, metadata)
            VALUES (%s, %s, %s, %s::jsonb)
        """, (clip_id, event_type, message, meta_json))
