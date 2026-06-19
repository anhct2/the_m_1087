import psycopg2
import psycopg2.extras
from contextlib import contextmanager
from .config import get_settings


def _dsn() -> str:
    s = get_settings()
    return (
        f"host={s.postgres_host} port={s.postgres_port} "
        f"dbname={s.postgres_db} user={s.postgres_user} "
        f"password={s.postgres_pass}"
    )


@contextmanager
def get_conn():
    """Context manager — yields a RealDictCursor connection, auto-closes."""
    conn = psycopg2.connect(_dsn(), cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        yield conn
    finally:
        conn.close()
