"""Опциональная аутентификация администратора.

Если переменная окружения TEXT_QUEST_ADMIN_PASSWORD не задана или пуста,
аутентификация полностью отключена (открытый режим для локального тестирования и разработки).

Если TEXT_QUEST_ADMIN_PASSWORD задана, для доступа к конструктору, созданию,
изменению и удалению квестов требуется авторизация:
  - Через форму входа на сайте (сохраняет сессионную cookie);
  - Через HTTP Basic Auth (браузерный popup или curl/API);
  - Через HTTP-заголовок X-Admin-Password.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel

COOKIE_NAME = "tq_admin_token"
_TOKEN_CONTEXT = b"text-quest-admin-session-v1"
_http_basic = HTTPBasic(auto_error=False)

router = APIRouter(prefix="/api/auth", tags=["Авторизация"])


def is_auth_enabled() -> bool:
    """Проверяет, включена ли защита паролем."""
    return bool(os.environ.get("TEXT_QUEST_ADMIN_PASSWORD", "").strip())


def get_admin_user() -> str:
    """Имя пользователя администратора (по умолчанию: admin)."""
    return os.environ.get("TEXT_QUEST_ADMIN_USER", "admin").strip() or "admin"


def get_admin_password() -> str:
    """Пароль администратора из переменной окружения."""
    return os.environ.get("TEXT_QUEST_ADMIN_PASSWORD", "").strip()


def _expected_token() -> str:
    """HMAC-SHA256 токен от связки логин:пароль для безопасного хранения в cookie."""
    secret = f"{get_admin_user()}:{get_admin_password()}".encode("utf-8")
    return hmac.new(secret, _TOKEN_CONTEXT, hashlib.sha256).hexdigest()


def check_is_authenticated(
    request: Request,
    credentials: HTTPBasicCredentials | None = None,
) -> bool:
    """Проверяет, авторизован ли текущий запрос (не выбрасывая исключений)."""
    if not is_auth_enabled():
        return True

    expected_user = get_admin_user()
    expected_pass = get_admin_password()
    expected_tok = _expected_token()

    # 1. Проверка Cookie
    cookie_val = request.cookies.get(COOKIE_NAME)
    if cookie_val and secrets.compare_digest(cookie_val, expected_tok):
        return True

    # 2. Проверка заголовка X-Admin-Password
    custom_header = request.headers.get("x-admin-password")
    if custom_header and secrets.compare_digest(custom_header.encode("utf-8"), expected_pass.encode("utf-8")):
        return True

    # 3. Проверка HTTP Basic Auth
    if credentials:
        user_ok = secrets.compare_digest(credentials.username.encode("utf-8"), expected_user.encode("utf-8"))
        pass_ok = secrets.compare_digest(credentials.password.encode("utf-8"), expected_pass.encode("utf-8"))
        if user_ok and pass_ok:
            return True

    return False


def require_admin(
    request: Request,
    credentials: Annotated[HTTPBasicCredentials | None, Depends(_http_basic)] = None,
) -> bool:
    """Зависимость FastAPI для защиты закрытых роутов (конструктор, редактирование)."""
    if not is_auth_enabled():
        return True

    if check_is_authenticated(request, credentials):
        return True

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Требуется авторизация администратора для управления квестами",
        headers={"WWW-Authenticate": 'Basic realm="Text Quest Admin"'},
    )


AdminDep = Annotated[bool, Depends(require_admin)]


# ---------- Schemas & Routes ----------


class LoginRequest(BaseModel):
    username: str | None = None
    password: str


class AuthStatus(BaseModel):
    auth_required: bool
    is_authenticated: bool
    username: str | None = None


@router.get("/status", response_model=AuthStatus, summary="Статус авторизации")
def auth_status(
    request: Request,
    credentials: Annotated[HTTPBasicCredentials | None, Depends(_http_basic)] = None,
):
    enabled = is_auth_enabled()
    is_auth = check_is_authenticated(request, credentials) if enabled else True
    return AuthStatus(
        auth_required=enabled,
        is_authenticated=is_auth,
        username=get_admin_user() if (enabled and is_auth) else None,
    )


@router.post("/login", response_model=AuthStatus, summary="Вход для администратора")
def login(payload: LoginRequest, response: Response):
    if not is_auth_enabled():
        return AuthStatus(auth_required=False, is_authenticated=True, username="admin")

    expected_user = get_admin_user()
    expected_pass = get_admin_password()

    # Если username указан, проверяем и его; если нет — проверяем только пароль
    if payload.username and not secrets.compare_digest(payload.username.encode("utf-8"), expected_user.encode("utf-8")):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный логин или пароль")

    if not secrets.compare_digest(payload.password.encode("utf-8"), expected_pass.encode("utf-8")):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный логин или пароль")

    token = _expected_token()
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 30,  # 30 дней
        path="/",
    )
    return AuthStatus(auth_required=True, is_authenticated=True, username=expected_user)


@router.post("/logout", summary="Выход администратора")
def logout(response: Response):
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return {"ok": True}
