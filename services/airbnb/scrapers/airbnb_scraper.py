"""
87TCS — Airbnb Calendar Scraper
Dựa trên code gốc của bạn, tổ chức lại thành class sạch.
"""

import re
import logging
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

logger = logging.getLogger(__name__)


class AirbnbCalendarScraper:
    """
    Scraper lịch Airbnb dùng Playwright để bắt API ngầm.
    Trả về dict {date_str: bool} — True = available, False = blocked.
    """

    TARGET_API_KEYWORDS = [
        "PdpAvailabilityCalendar",
        "StaysPdpSections",
    ]

    def __init__(self, headless: bool = True, timeout_ms: int = 40000):
        self.headless = headless
        self.timeout_ms = timeout_ms
        self._captured: dict[str, bool] = {}

    # ----------------------------------------------------------
    # Public
    # ----------------------------------------------------------
    def scrape(self, url: str) -> dict[str, bool]:
        """
        Truy cập URL Airbnb, bắt API ngầm, trả về lịch.
        Returns: {date_str: is_available} ví dụ {"2025-07-01": True}
        """
        self._captured = {}

        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=self.headless,
                args=["--disable-blink-features=AutomationControlled"],
            )
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1920, "height": 1080},
            )
            page = context.new_page()
            page.add_init_script(
                "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
            )
            page.on("response", self._handle_response)

            try:
                logger.info(f"[Scraper] Truy cập: {url}")
                page.goto(url, wait_until="domcontentloaded", timeout=self.timeout_ms)
                page.wait_for_timeout(2000)

                # Cuộn để trigger lazy load
                page.evaluate("window.scrollTo(0, 800)")
                page.wait_for_timeout(1000)

                # Thử click nút calendar nếu có
                try:
                    btn = page.locator(
                        'button:has-text("Check availability"), '
                        'button:has-text("Add dates")'
                    ).first
                    if btn.is_visible(timeout=2000):
                        btn.click(timeout=3000)
                except Exception:
                    pass

                # Đợi API trả về
                page.wait_for_timeout(5000)

            except PlaywrightTimeout:
                logger.warning(f"[Scraper] Timeout khi load: {url}")
            except Exception as e:
                logger.error(f"[Scraper] Lỗi: {e}")
            finally:
                browser.close()

        logger.info(f"[Scraper] Bắt được {len(self._captured)} ngày")
        return dict(self._captured)

    # ----------------------------------------------------------
    # Private
    # ----------------------------------------------------------
    def _handle_response(self, response):
        if not any(kw in response.url for kw in self.TARGET_API_KEYWORDS):
            return
        try:
            data = response.json()
            self._extract_dates(data)
        except Exception:
            pass

    def _extract_dates(self, data):
        """Đệ quy lấy date + availability từ JSON bất kỳ cấu trúc."""
        if isinstance(data, dict):
            date_val = (
                data.get("calendarDate")
                or data.get("date")
                or data.get("localDate")
            )
            if date_val and isinstance(date_val, str) and re.match(r"^\d{4}-\d{2}-\d{2}$", date_val):
                is_avail = (
                    data.get("availableForCheckin")
                    or data.get("available")
                    or data.get("isAvailable")
                    or False
                )
                self._captured[date_val] = bool(is_avail)

            for val in data.values():
                self._extract_dates(val)

        elif isinstance(data, list):
            for item in data:
                self._extract_dates(item)
