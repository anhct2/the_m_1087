"""
87TCS — DB helper cho airbnb-calendar module
"""

import logging
import psycopg2
import psycopg2.extras
from contextlib import contextmanager
from datetime import date

logger = logging.getLogger(__name__)


class CalendarDB:
    def __init__(self, dsn: str):
        """
        dsn ví dụ: "host=localhost port=5555 dbname=m1087 user=postgres password=xxx"
        """
        self._dsn = dsn

    @contextmanager
    def conn(self):
        c = psycopg2.connect(self._dsn)
        try:
            yield c
            c.commit()
        except Exception:
            c.rollback()
            raise
        finally:
            c.close()

    # ----------------------------------------------------------
    # Rooms
    # ----------------------------------------------------------
    def get_rooms_to_scrape(self) -> list[dict]:
        """
        Dùng view v_should_scrape để lấy danh sách phòng cần chạy hôm nay.
        """
        with self.conn() as c:
            with c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("SELECT * FROM v_should_scrape ORDER BY room_id")
                return [dict(r) for r in cur.fetchall()]

    def get_room_id_by_code(self, room_code: str) -> int | None:
        with self.conn() as c:
            with c.cursor() as cur:
                cur.execute("SELECT id FROM rooms WHERE room_code = %s", (room_code,))
                row = cur.fetchone()
                return row[0] if row else None


    # ----------------------------------------------------------
    # Scrape runs
    # ----------------------------------------------------------
    def start_run(self, room_id: int, triggered_by: str,
                  today_avail: bool | None, tomorrow_avail: bool | None) -> int:
        """Tạo record scrape_run, trả về run_id."""
        with self.conn() as c:
            with c.cursor() as cur:
                cur.execute("""
                    INSERT INTO scrape_runs
                        (room_id, triggered_by, today_available, tomorrow_available)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id
                """, (room_id, triggered_by, today_avail, tomorrow_avail))
                return cur.fetchone()[0]

    def finish_run(self, run_id: int, status: str,
                   days_fetched: int = 0, days_updated: int = 0,
                   error: str | None = None, skip_reason: str | None = None):
        with self.conn() as c:
            with c.cursor() as cur:
                cur.execute("""
                    UPDATE scrape_runs
                    SET status        = %s,
                        finished_at   = NOW(),
                        days_fetched  = %s,
                        days_updated  = %s,
                        error_message = %s,
                        skip_reason   = %s
                    WHERE id = %s
                """, (status, days_fetched, days_updated, error, skip_reason, run_id))

    # ----------------------------------------------------------
    # Calendar upsert
    # ----------------------------------------------------------
    def upsert_calendar(self, room_id: int, run_id: int,
                        calendar: dict[str, bool]) -> int:
        """
        UPSERT lịch vào airbnb_calendar.
        Trả về số ngày có thay đổi so với record cũ.
        """
        if not calendar:
            return 0

        rows = [
            (room_id, date_str, is_avail, run_id)
            for date_str, is_avail in calendar.items()
        ]

        changed = 0
        with self.conn() as c:
            with c.cursor() as cur:
                for room_id_, date_str, is_avail, run_id_ in rows:
                    cur.execute("""
                        INSERT INTO airbnb_calendar
                            (room_id, calendar_date, is_available, scrape_run_id, scraped_at)
                        VALUES (%s, %s, %s, %s, NOW())
                        ON CONFLICT (room_id, calendar_date) DO UPDATE
                            SET is_available  = EXCLUDED.is_available,
                                scraped_at    = EXCLUDED.scraped_at,
                                scrape_run_id = EXCLUDED.scrape_run_id
                            WHERE airbnb_calendar.is_available <> EXCLUDED.is_available
                        RETURNING (xmax = 0) AS inserted
                    """, (room_id_, date_str, is_avail, run_id_))
                    row = cur.fetchone()
                    # row là None nếu DO UPDATE không trigger (giá trị không đổi)
                    if row is not None:
                        changed += 1
        return changed

    # ----------------------------------------------------------
    # Query helpers (dùng sau này cho camera tracking)
    # ----------------------------------------------------------
    def is_room_available(self, room_code: str, check_date: date) -> bool | None:
        """
        Trả về True/False/None (None = chưa có data).
        Dùng trong camera tracking để loại trừ nhiễu từ phòng bận.
        """
        with self.conn() as c:
            with c.cursor() as cur:
                cur.execute("""
                    SELECT ac.is_available
                    FROM airbnb_calendar ac
                    JOIN rooms r ON r.id = ac.room_id
                    WHERE r.room_code    = %s
                      AND ac.calendar_date = %s
                """, (room_code, check_date))
                row = cur.fetchone()
                return row[0] if row else None

    def get_active_rooms_today(self) -> list[str]:
        """
        Trả về list room_code nào available hôm nay.
        Camera tracking dùng để biết tầng nào cần track.
        """
        with self.conn() as c:
            with c.cursor() as cur:
                cur.execute("""
                    SELECT r.room_code
                    FROM airbnb_calendar ac
                    JOIN rooms r ON r.id = ac.room_id
                    WHERE ac.calendar_date = CURRENT_DATE
                      AND ac.is_available  = TRUE
                      AND r.is_active      = TRUE
                    ORDER BY r.room_code
                """)
                return [row[0] for row in cur.fetchall()]
