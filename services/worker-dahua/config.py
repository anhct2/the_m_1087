import os
from dataclasses import dataclass, field
from dotenv import load_dotenv

load_dotenv()


@dataclass
class Config:
    # ── NVR ─────────────────────────────────
    nvr_ip:   str = field(default_factory=lambda: os.getenv('NVR_IP', '192.168.1.88'))
    nvr_port: int = field(default_factory=lambda: int(os.getenv('NVR_PORT', '37777')))
    nvr_user: str = field(default_factory=lambda: os.getenv('NVR_USER', 'admin'))
    nvr_pass: str = field(default_factory=lambda: os.getenv('NVR_PASS', 'admin'))

    # ── Database ────────────────────────────
    db_url: str = field(
        default_factory=lambda: os.getenv(
            'DATABASE_URL', 'postgresql://user:pass@localhost:5432/the_m_1087'
        )
    )

    # ── Paths ───────────────────────────────
    sdk_lib_path:     str = field(default_factory=lambda: os.getenv('SDK_LIB_PATH', '/app/sdk/linux64/libdhnetsdk.so'))
    video_output_dir: str = field(default_factory=lambda: os.getenv('VIDEO_OUTPUT_DIR', '/data/videos'))
    dav_temp_dir:     str = field(default_factory=lambda: os.getenv('DAV_TEMP_DIR', '/tmp/dav'))

    # ── Worker ──────────────────────────────
    max_workers:               int = field(default_factory=lambda: int(os.getenv('MAX_WORKERS', '3')))
    poll_interval_seconds:     int = field(default_factory=lambda: int(os.getenv('POLL_INTERVAL', '10')))
    scheduler_interval_seconds: int = field(default_factory=lambda: int(os.getenv('SCHEDULER_INTERVAL', '5')))
    max_retries:               int = field(default_factory=lambda: int(os.getenv('MAX_RETRIES', '3')))
    retry_delay_seconds:       int = field(default_factory=lambda: int(os.getenv('RETRY_DELAY', '10')))

    # ── SDK constants (không thay đổi) ──────
    sdk_connect_timeout_ms: int = 5000
    sdk_login_timeout_ms:   int = 5000


config = Config()
