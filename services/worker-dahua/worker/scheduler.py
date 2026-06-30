import logging
from concurrent.futures import ThreadPoolExecutor, Future

from db.queries import get_ready_clips

log = logging.getLogger(__name__)

_executor: ThreadPoolExecutor | None = None


def init_executor(max_workers: int) -> None:
    global _executor
    _executor = ThreadPoolExecutor(
        max_workers=max_workers,
        thread_name_prefix='dahua-worker',
        # Initializer để SDK login sớm (optional — sẽ login lazy trong download_clip)
    )
    log.info(f"[Scheduler] Thread pool khởi động: max_workers={max_workers}")


def shutdown_executor(wait: bool = True) -> None:
    global _executor
    if _executor:
        log.info("[Scheduler] Shutdown thread pool...")
        _executor.shutdown(wait=wait)
        _executor = None


def run_scheduler() -> None:
    """
    Job chạy mỗi SCHEDULER_INTERVAL giây (mặc định 5s).
    Lấy clips sẵn sàng (SKIP LOCKED) → submit vào thread pool.
    """
    if _executor is None:
        return

    # Không submit thêm nếu pool đang bận hết
    pending = _executor._work_queue.qsize() if hasattr(_executor, '_work_queue') else 0
    if pending > 8:
        log.debug(f"[Scheduler] Queue đầy ({pending} tasks), bỏ qua cycle này")
        return

    try:
        clips = get_ready_clips(limit=4)
    except Exception as e:
        log.error(f"[Scheduler] Lỗi khi lấy ready clips: {e}")
        return

    if not clips:
        return

    log.info(f"[Scheduler] Dispatch {len(clips)} clip(s) vào worker pool")

    from worker.processor import process_clip

    for clip in clips:
        future: Future = _executor.submit(process_clip, clip)
        future.add_done_callback(_on_done)


def _on_done(future: Future) -> None:
    """Callback khi task kết thúc — log nếu có exception bất ngờ."""
    try:
        future.result()
    except Exception as e:
        log.error(f"[Scheduler] Unhandled exception trong worker: {e}", exc_info=True)
