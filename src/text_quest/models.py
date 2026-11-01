"""Таблицы базы данных."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(UTC)


class Quest(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(max_length=200, index=True)
    description: str = Field(default="")
    start_scene_id: int | None = Field(default=None)
    # Начальные переменные квеста, например {"hp": 100, "gold": 0}
    initial_variables: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, default={}),
    )


class Scene(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    quest_id: int = Field(foreign_key="quest.id", ondelete="CASCADE", index=True)
    title: str = Field(default="", max_length=200)
    text: str = Field(default="")
    # None — обычная сцена, "win" — победная концовка, "lose" — поражение.
    ending: str | None = Field(default=None)
    # Координаты для 2D-графа на холсте
    pos_x: float | None = Field(default=None)
    pos_y: float | None = Field(default=None)
    # Медиа: изображение и фоновое аудио
    image_url: str | None = Field(default=None, max_length=1000)
    audio_url: str | None = Field(default=None, max_length=1000)


class Choice(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    scene_id: int = Field(foreign_key="scene.id", ondelete="CASCADE", index=True)
    text: str = Field(default="")
    # None — игрок остаётся в текущей сцене
    target_scene_id: int | None = Field(default=None, foreign_key="scene.id", ondelete="SET NULL", index=True)
    # Базовые поля предметов (обратная совместимость)
    required_item: str | None = Field(default=None, max_length=100)
    item_given: str | None = Field(default=None, max_length=100)
    # Расширенные условия (список словарей с условиями)
    conditions: list[dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, default=[]),
    )
    # Действия над переменными и предметами (например {"add": {"gold": 10}, "set": {"visited": True}})
    actions: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, default={}),
    )


class GameSession(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    quest_id: int = Field(foreign_key="quest.id", ondelete="CASCADE", index=True)
    current_scene_id: int | None = Field(default=None, foreign_key="scene.id", ondelete="SET NULL")
    inventory: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    variables: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, default={}),
    )
    history: list[int] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    # Снапшоты предыдущих ходов для функции Undo/назад
    snapshots: list[dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, default=[]),
    )
    # Журнал сделанных выборов [(scene_id, choice_text)]
    log: list[dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, default=[]),
    )
    steps: int = Field(default=0)
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
