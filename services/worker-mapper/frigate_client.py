"""
frigate_client.py — Frigate session-based auth.
Dựa trên code đã test OK với https://f87.m2s.io.vn
"""

import logging
import requests

log = logging.getLogger(__name__)

SESSION_HEADERS = {
    "X-CSRF-TOKEN":   "1",
    "X-CACHE-BYPASS": "1",
}


class FrigateClient:
    def __init__(self, url: str, username: str, password: str):
        self.url      = url.rstrip("/")
        self.username = username
        self.password = password
        self.session  = requests.Session()
        self.session.headers.update(SESSION_HEADERS)
        self._logged_in = False

    def login(self):
        resp = self.session.post(
            f"{self.url}/api/login",
            json={"user": self.username, "password": self.password},
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
        if resp.status_code == 200:
            self._logged_in = True
            log.info(f"Frigate login OK — user={self.username} cookies={list(self.session.cookies.keys())}")
        else:
            raise RuntimeError(f"Frigate login failed [{resp.status_code}]: {resp.text[:200]}")

    def _ensure_auth(self):
        if not self._logged_in:
            self.login()

    def get_events(self, camera: str, after_unix: float, before_unix: float,
                   label: str = "person", limit: int = 50) -> list[dict]:
        self._ensure_auth()
        params = {
            "camera":   camera,
            "label":    label,
            "after":    int(after_unix),   # Frigate 0.17.x cần int
            "before":   int(before_unix),
            "limit":    limit,
            "has_clip": 1,
        }
        try:
            r = self.session.get(f"{self.url}/api/events", params=params, timeout=10)
            # Token hết hạn → re-login 1 lần
            if r.status_code == 401:
                log.warning("401 — re-login")
                self._logged_in = False
                self.login()
                r = self.session.get(f"{self.url}/api/events", params=params, timeout=10)
            r.raise_for_status()
            return r.json()
        except requests.RequestException as e:
            log.warning(f"Frigate API error [{camera}]: {e}")
            return []

    def snapshot_url(self, event_id: str) -> str:
        return f"{self.url}/api/events/{event_id}/snapshot.jpg"

    def clip_url(self, event_id: str) -> str:
        return f"{self.url}/api/events/{event_id}/clip.mp4"
