"""
auth.py — Simple in-memory token auth.

Upgrade path to JWT:
  1. Add jwt_secret to Settings
  2. Replace _create_token() with jose.jwt.encode()
  3. Replace _verify_token() with jose.jwt.decode()
  4. Drop _store dict entirely
"""
import secrets
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .config import get_settings

bearer = HTTPBearer(auto_error=False)

# token → username  (swap for Redis or JWT decode later)
_store: dict[str, str] = {}


def _create_token(username: str) -> str:
    token = secrets.token_hex(32)
    _store[token] = username
    return token


def _verify_token(token: str) -> str | None:
    return _store.get(token)


def _revoke_token(token: str):
    _store.pop(token, None)


def require_auth(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> str:
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing token")
    user = _verify_token(creds.credentials)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    return user


# Public exports
create_token = _create_token
revoke_token  = _revoke_token
get_credentials = lambda creds=Depends(bearer): creds
