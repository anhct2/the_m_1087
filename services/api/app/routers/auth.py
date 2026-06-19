from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel
from ..core.config import get_settings
from ..core.auth import create_token, revoke_token, require_auth, bearer

router = APIRouter()


class LoginBody(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(body: LoginBody):
    cfg = get_settings()
    if body.username != cfg.auth_username or body.password != cfg.auth_password:
        raise HTTPException(401, detail="Sai tên đăng nhập hoặc mật khẩu")
    token = create_token(body.username)
    return {
        "token": token,
        "user": {"username": body.username, "role": "admin"},
    }


@router.post("/logout")
def logout(
    _user: str = Depends(require_auth),
    creds: HTTPAuthorizationCredentials = Depends(bearer),
):
    revoke_token(creds.credentials)
    return {"ok": True}


@router.get("/me")
def me(user: str = Depends(require_auth)):
    return {"username": user, "role": "admin"}
