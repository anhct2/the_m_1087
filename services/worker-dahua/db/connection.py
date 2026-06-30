import threading
import logging
import psycopg2
from psycopg2 import pool
from contextlib import contextmanager
from config import config

log = logging.getLogger(__name__)

_pool: pool.ThreadedConnectionPool | None = None
_lock = threading.Lock()


def init_pool(minconn: int = 2, maxconn: int = 10) -> None:
    global _pool
    with _lock:
        if _pool is None:
            _pool = pool.ThreadedConnectionPool(
                minconn=minconn,
                maxconn=maxconn,
                dsn=config.db_url,
            )
            log.info(f"DB pool ready (min={minconn} max={maxconn})")


def _get() -> psycopg2.extensions.connection:
    if _pool is None:
        init_pool()
    return _pool.getconn()  # type: ignore[union-attr]


def _put(conn: psycopg2.extensions.connection) -> None:
    if _pool:
        _pool.putconn(conn)


@contextmanager
def db_cursor():
    """
    Context manager trả về cursor, tự commit/rollback và trả connection về pool.
    Dùng:
        with db_cursor() as cur:
            cur.execute(...)
    """
    conn = _get()
    cur = conn.cursor()
    try:
        yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        _put(conn)
