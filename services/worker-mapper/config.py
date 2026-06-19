import os
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

@dataclass
class Config:
    pg_host:        str
    pg_port:        int
    pg_db:          str
    pg_user:        str
    pg_pass:        str
    interval_sec:   int
    window_sec:     int
    lookback_hours: int
    device_name:    str

def load_config() -> Config:
    return Config(
        pg_host        = os.getenv("POSTGRES_HOST", "localhost"),
        pg_port        = int(os.getenv("POSTGRES_PORT", "5555")),
        pg_db          = os.getenv("POSTGRES_DB",   "m1087"),
        pg_user        = os.getenv("POSTGRES_USER", "m1087"),
        pg_pass        = os.getenv("POSTGRES_PASS", ""),
        interval_sec   = int(os.getenv("MAPPER_INTERVAL_SEC",   "300")),
        window_sec     = int(os.getenv("MAPPER_WINDOW_SEC",     "120")),
        lookback_hours = int(os.getenv("MAPPER_LOOKBACK_HOURS", "2")),
        device_name    = os.getenv("MAPPER_DEVICE_NAME", "frigate-87tcs"),
    )
