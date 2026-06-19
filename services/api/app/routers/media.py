"""
media.py — Public media proxy endpoints (no auth — img tags cannot send Bearer).
Security: event_id format validation + backend Frigate session is separate from browser.
"""
import re
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from ..core.frigate_session import frigate_mgr

router = APIRouter()

_EVENT_ID_RE = re.compile(r'^[\d.]+-[a-z0-9]+$')


@router.get("/snapshot/{event_id}")
async def proxy_snapshot(event_id: str):
    if not _EVENT_ID_RE.match(event_id):
        raise HTTPException(400, "Invalid event_id")

    try:
        resp = await frigate_mgr.get(f"/api/events/{event_id}/snapshot.jpg")
    except RuntimeError as e:
        raise HTTPException(503, str(e))

    if resp.status_code == 404:
        raise HTTPException(404, "Snapshot not found")
    if resp.status_code != 200:
        raise HTTPException(502, f"Frigate {resp.status_code}")

    return Response(
        content=resp.content,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=3600"},
    )
