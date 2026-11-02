"""FastAPI application: REST API + HTML views."""

from __future__ import annotations

import os
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request, status
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from . import auth, db
from .api import game, quests
from .auth import require_admin
from .seed import seed_if_empty

WEB_DIR = Path(__file__).resolve().parent / "web"
PAGES_DIR = WEB_DIR / "pages"

# In-memory Rate Limiting (IP -> timestamps)
_RATE_LIMIT_STORE: dict[str, list[float]] = defaultdict(list)
_MAX_REQUESTS_PER_MINUTE = int(os.environ.get("TEXT_QUEST_RATE_LIMIT_PER_MIN", "240"))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db()
    with Session(db.engine) as session:
        seed_if_empty(session)
    yield


app = FastAPI(
    title="Quest Forge",
    description="Visual interactive story engine & node-based quest constructor.",
    version="0.3.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Simple in-memory rate limiting to protect API endpoints from overload."""
    path = request.url.path
    if path.startswith("/api/"):
        client_ip = request.client.host if request.client else "127.0.0.1"
        now = time.monotonic()
        recent = [t for t in _RATE_LIMIT_STORE[client_ip] if now - t < 60]
        if len(recent) >= _MAX_REQUESTS_PER_MINUTE:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Too many requests. Please wait a minute."},
                headers={"Retry-After": "60"},
            )
        recent.append(now)
        _RATE_LIMIT_STORE[client_ip] = recent

    response = await call_next(request)
    return response


@app.middleware("http")
async def no_cache_middleware(request: Request, call_next):
    """Prevents browser caching of dynamic pages, static scripts, and API responses."""
    response = await call_next(request)
    path = request.url.path
    if (
        path.startswith("/api/")
        or path.startswith("/builder")
        or path.startswith("/play")
        or path == "/"
        or path.startswith("/static/")
    ):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


@app.get("/health", tags=["System"], summary="Service healthcheck")
def healthcheck():
    """Endpoint for Docker healthcheck and cloud monitoring."""
    with Session(db.engine) as session:
        session.exec(select(1)).first()
    return {"status": "ok", "version": "0.3.0"}


app.include_router(auth.router)
app.include_router(quests.router)
app.include_router(game.router)
app.mount("/static", StaticFiles(directory=WEB_DIR / "static"), name="static")


def _page(name: str) -> FileResponse:
    return FileResponse(PAGES_DIR / name, media_type="text/html; charset=utf-8")


@app.get("/", include_in_schema=False)
def catalog_page():
    return _page("index.html")


@app.get("/play/{quest_id}", include_in_schema=False)
def play_page(quest_id: int):
    return _page("play.html")


@app.get("/builder", include_in_schema=False, dependencies=[Depends(require_admin)])
def builder_root():
    return RedirectResponse("/?new=1")


@app.get("/builder/{quest_id}", include_in_schema=False, dependencies=[Depends(require_admin)])
def builder_page(quest_id: int):
    return _page("builder.html")
