from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class VideoClip:
    clip_id:       str
    request_id:    str
    camera_id:     str          # 'N1' | 'S1' | 'S2'
    clip_start:    datetime
    clip_end:      datetime
    status:        str          # pending | downloading | converting | completed | failed
    retry_count:   int

    dav_temp_path:   Optional[str]      = None
    mp4_path:        Optional[str]      = None
    file_size_bytes: Optional[int]      = None
    error_message:   Optional[str]      = None
    worker_id:       Optional[str]      = None
    retry_after:     Optional[datetime] = None
    started_at:      Optional[datetime] = None
    completed_at:    Optional[datetime] = None
    created_at:      Optional[datetime] = None


@dataclass
class ExtractionRequest:
    request_id:      str
    session_id:      str
    event_time_vn:   datetime
    direction:       str        # 'incoming' | 'outgoing'
    scheduled_after: datetime
    overall_status:  str        # pending | processing | completed | partial_failed | failed
    created_at:      Optional[datetime] = None
