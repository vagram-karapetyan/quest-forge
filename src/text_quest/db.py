"""Подключение к SQLite, миграции и зависимости FastAPI для сессии БД."""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path
from typing import Annotated

from fastapi import Depends
from sqlalchemy import Engine, event, text
from sqlmodel import Session, SQLModel, create_engine

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = PROJECT_ROOT / "data" / "text_quest.db"


def _resolve_db_path(custom_path: Path | str | None = None) -> Path:
    if custom_path is not None:
        return Path(custom_path)
    env_path = os.environ.get("TEXT_QUEST_DB", "").strip()
    return Path(env_path) if env_path else DEFAULT_DB_PATH


def _attach_sqlite_pragma(eng: Engine) -> None:
    @event.listens_for(eng, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
        """SQLite по умолчанию игнорирует внешние ключи — включаем каскадное удаление."""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()


DB_PATH: Path = _resolve_db_path()
engine: Engine = create_engine(
    f"sqlite:///{DB_PATH.as_posix()}",
    connect_args={"check_same_thread": False},
)
_attach_sqlite_pragma(engine)


def configure_db(custom_path: Path | str | None = None) -> Engine:
    """Переключает подключение к БД на новый путь (используется при инициализации и в тестах)."""
    global DB_PATH, engine
    target = _resolve_db_path(custom_path)
    if target.resolve() != DB_PATH.resolve():
        engine.dispose()
        DB_PATH = target
        engine = create_engine(
            f"sqlite:///{DB_PATH.as_posix()}",
            connect_args={"check_same_thread": False},
        )
        _attach_sqlite_pragma(engine)
    return engine


def migrate_db() -> None:
    """Автоматически добавляет новые колонки в существующие таблицы SQLite."""
    columns_to_add = [
        ("quest", "initial_variables", "JSON DEFAULT '{}'"),
        ("scene", "pos_x", "REAL DEFAULT NULL"),
        ("scene", "pos_y", "REAL DEFAULT NULL"),
        ("scene", "image_url", "TEXT DEFAULT NULL"),
        ("scene", "audio_url", "TEXT DEFAULT NULL"),
        ("choice", "conditions", "JSON DEFAULT '[]'"),
        ("choice", "actions", "JSON DEFAULT '{}'"),
        ("gamesession", "variables", "JSON DEFAULT '{}'"),
        ("gamesession", "snapshots", "JSON DEFAULT '[]'"),
        ("gamesession", "log", "JSON DEFAULT '[]'"),
    ]
    with engine.connect() as conn:
        for table, col_name, col_def in columns_to_add:
            try:
                res = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
                existing = [row[1] for row in res]
                if existing and col_name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}"))
                    conn.commit()
            except Exception:
                pass


def init_db() -> None:
    # Импорт нужен, чтобы модели зарегистрировались в metadata.
    from . import models  # noqa: F401

    configure_db()
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)
    migrate_db()


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
