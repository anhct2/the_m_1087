from fastapi import APIRouter, Depends
from ..core.db import get_conn
from ..core.auth import require_auth

router = APIRouter()


@router.get("")
def list_users(_=Depends(require_auth)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT user_name
                FROM gate_session_clips
                WHERE user_name IS NOT NULL AND user_name != 'Unknown'
                ORDER BY user_name
            """)
            return [r["user_name"] for r in cur.fetchall()]
