import logging
from db.queries import get_unprocessed_sessions, create_extraction_request

log = logging.getLogger(__name__)


def run_poller() -> None:
    """
    Job chạy mỗi POLL_INTERVAL giây (mặc định 10s).
    Quét gate_sessions → tạo video_extraction_requests + 3 video_clips.
    """
    try:
        sessions = get_unprocessed_sessions()
    except Exception as e:
        log.error(f"[Poller] Lỗi khi query gate_sessions: {e}")
        return

    if not sessions:
        return

    created = 0
    skipped = 0

    for s in sessions:
        try:
            request_id = create_extraction_request(
                session_id    = s['session_id'],
                event_time_vn = s['event_time_vn'],
                direction     = s['direction'],
            )
            if request_id:
                log.info(
                    f"[Poller] ✓ request={request_id[:8]}  "
                    f"session={s['session_id'][:8]}  "
                    f"dir={s['direction']}  "
                    f"T={s['event_time_vn'].strftime('%H:%M:%S')}"
                )
                created += 1
            else:
                skipped += 1

        except Exception as e:
            log.error(f"[Poller] Lỗi tạo request cho session={s['session_id'][:8]}: {e}")

    if created or skipped:
        log.info(
            f"[Poller] Scan xong: {created} request mới, "
            f"{skipped} bỏ qua (đã tồn tại), "
            f"từ {len(sessions)} session"
        )
