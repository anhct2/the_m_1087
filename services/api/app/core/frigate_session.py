"""
frigate_session.py — Singleton Frigate HTTP session cho API backend.
Login 1 lần khi startup, tự re-login khi cookie hết hạn (401).
"""
import asyncio
import logging
import httpx

log = logging.getLogger(__name__)

HEADERS = {"X-CSRF-TOKEN": "1", "X-CACHE-BYPASS": "1"}


class FrigateSessionManager:
    def __init__(self):
        self._cookies: dict  = {}
        self._lock           = asyncio.Lock()
        self._url:  str      = ""
        self._user: str      = ""
        self._pass: str      = ""
        self._ready: bool    = False

    def configure(self, url: str, username: str, password: str):
        self._url   = url.rstrip("/")
        self._user  = username
        self._pass  = password
        self._ready = bool(url and username and password)
        log.info(f"FrigateSessionManager configured: url={self._url} user={self._user} ready={self._ready}")

    async def _do_login(self, client: httpx.AsyncClient):
        resp = await client.post(
            f"{self._url}/api/login",
            json={"user": self._user, "password": self._pass},
            headers={**HEADERS, "Content-Type": "application/json"},
            timeout=15,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Frigate login failed {resp.status_code}: {resp.text[:200]}")
        self._cookies = dict(resp.cookies)
        log.info(f"Frigate session OK — cookies: {list(self._cookies.keys())}")

    async def get(self, path: str) -> httpx.Response:
        if not self._ready:
            raise RuntimeError("FrigateSessionManager not configured — check devices table in DB")

        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            # Lần đầu chưa có cookie → login trước
            if not self._cookies:
                async with self._lock:
                    if not self._cookies:
                        await self._do_login(client)

            resp = await client.get(
                f"{self._url}{path}",
                cookies=self._cookies,
                headers=HEADERS,
            )

            # Cookie hết hạn → re-login 1 lần
            if resp.status_code == 401:
                log.warning(f"Frigate 401 on {path} — re-login")
                async with self._lock:
                    await self._do_login(client)
                resp = await client.get(
                    f"{self._url}{path}",
                    cookies=self._cookies,
                    headers=HEADERS,
                )

            return resp


# Singleton
frigate_mgr = FrigateSessionManager()
