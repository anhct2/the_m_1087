from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import os

from .routers import auth, stats, sessions, users, media
from .core.config import get_settings
from .core.db import get_conn
from .core.frigate_session import frigate_mgr

cfg = get_settings()

app = FastAPI(
    title="87 TCS Gate Monitor API",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────
app.include_router(auth.router,     prefix="/api/auth",     tags=["auth"])
app.include_router(stats.router,    prefix="/api/stats",    tags=["stats"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(users.router,    prefix="/api/users",    tags=["users"])
app.include_router(media.router,    prefix="/api/media",    tags=["media"])   # no auth

# ── Health ───────────────────────────────────────────────────
@app.get("/api/health", tags=["system"])
def health():
    return {"status": "ok", "version": "2.0.0"}

# ── Startup: init Frigate session ────────────────────────────
@app.on_event("startup")
async def startup():
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT public_url, username, password FROM devices "
                    "WHERE name='frigate-87tcs' AND enabled=TRUE LIMIT 1"
                )
                row = cur.fetchone()
        if row:
            frigate_mgr.configure(row["public_url"], row["username"], row["password"])
        else:
            import logging
            logging.getLogger(__name__).warning("No device 'frigate-87tcs' found in DB")
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Frigate session init failed: {e}")

# ── Serve React SPA ──────────────────────────────────────────
_static = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.isdir(_static):
    app.mount("/assets", StaticFiles(directory=os.path.join(_static, "assets")), name="assets")

    @app.get("/", response_class=HTMLResponse, include_in_schema=False)
    @app.get("/{path:path}", response_class=HTMLResponse, include_in_schema=False)
    def spa(path: str = ""):
        if path.startswith("api"):
            raise HTTPException(404)
        with open(os.path.join(_static, "index.html"), encoding="utf-8") as f:
            return f.read()
