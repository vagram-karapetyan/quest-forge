"""Pydantic-схемы запросов и ответов API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Ending = Literal["win", "lose"]
GameStatus = Literal["playing", "win", "lose", "end"]


def _clean_item(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


class ReadModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Квесты ----------


class QuestCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    initial_variables: dict[str, Any] = Field(default_factory=dict)


class QuestUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    start_scene_id: int | None = None
    initial_variables: dict[str, Any] | None = None


class QuestRead(ReadModel):
    id: int
    title: str
    description: str
    start_scene_id: int | None
    initial_variables: dict[str, Any] = Field(default_factory=dict)


class QuestSummary(QuestRead):
    scene_count: int
    win_endings: int
    lose_endings: int
    playable: bool


# ---------- Сцены и выборы ----------


class SceneCreate(BaseModel):
    title: str = Field(default="", max_length=200)
    text: str = Field(default="", max_length=20000)
    ending: Ending | None = None
    pos_x: float | None = None
    pos_y: float | None = None
    image_url: str | None = Field(default=None, max_length=1000)
    audio_url: str | None = Field(default=None, max_length=1000)


class SceneUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    text: str | None = Field(default=None, max_length=20000)
    ending: Ending | None = None
    pos_x: float | None = None
    pos_y: float | None = None
    image_url: str | None = Field(default=None, max_length=1000)
    audio_url: str | None = Field(default=None, max_length=1000)


class ChoiceCreate(BaseModel):
    text: str = Field(default="", max_length=500)
    target_scene_id: int | None = None
    required_item: str | None = Field(default=None, max_length=100)
    item_given: str | None = Field(default=None, max_length=100)
    conditions: list[dict[str, Any]] = Field(default_factory=list)
    actions: dict[str, Any] = Field(default_factory=dict)

    @field_validator("required_item", "item_given")
    @classmethod
    def _strip_items(cls, value: str | None) -> str | None:
        return _clean_item(value)


class ChoiceUpdate(BaseModel):
    text: str | None = Field(default=None, max_length=500)
    target_scene_id: int | None = None
    required_item: str | None = Field(default=None, max_length=100)
    item_given: str | None = Field(default=None, max_length=100)
    conditions: list[dict[str, Any]] | None = None
    actions: dict[str, Any] | None = None

    @field_validator("required_item", "item_given")
    @classmethod
    def _strip_items(cls, value: str | None) -> str | None:
        return _clean_item(value)


class ChoiceRead(ReadModel):
    id: int
    scene_id: int
    text: str
    target_scene_id: int | None
    required_item: str | None
    item_given: str | None
    conditions: list[dict[str, Any]] = Field(default_factory=list)
    actions: dict[str, Any] = Field(default_factory=dict)


class SceneRead(ReadModel):
    id: int
    quest_id: int
    title: str
    text: str
    ending: Ending | None
    pos_x: float | None = None
    pos_y: float | None = None
    image_url: str | None = None
    audio_url: str | None = None


class SceneDetail(SceneRead):
    choices: list[ChoiceRead] = Field(default_factory=list)


class QuestDetail(QuestRead):
    scenes: list[SceneDetail] = Field(default_factory=list)


# ---------- Импорт квеста ----------


class ChoiceImport(BaseModel):
    id: Any = None
    text: str = Field(default="", max_length=500)
    target_scene_id: Any = None
    required_item: str | None = Field(default=None, max_length=100)
    item_given: str | None = Field(default=None, max_length=100)
    conditions: list[dict[str, Any]] = Field(default_factory=list)
    actions: dict[str, Any] = Field(default_factory=dict)

    @field_validator("text", mode="before")
    @classmethod
    def _default_text(cls, value: Any) -> str:
        return "" if value is None else str(value)

    @field_validator("required_item", "item_given", mode="before")
    @classmethod
    def _strip_items(cls, value: Any) -> str | None:
        if value is None:
            return None
        return _clean_item(str(value))

    @field_validator("conditions", mode="before")
    @classmethod
    def _default_conditions(cls, value: Any) -> list[dict[str, Any]]:
        return value if isinstance(value, list) else []

    @field_validator("actions", mode="before")
    @classmethod
    def _default_actions(cls, value: Any) -> dict[str, Any]:
        return value if isinstance(value, dict) else {}


class SceneImport(BaseModel):
    id: Any = None
    title: str = Field(default="", max_length=200)
    text: str = Field(default="", max_length=20000)
    ending: Ending | None = None
    pos_x: float | None = None
    pos_y: float | None = None
    image_url: str | None = Field(default=None, max_length=1000)
    audio_url: str | None = Field(default=None, max_length=1000)
    choices: list[ChoiceImport] = Field(default_factory=list)

    @field_validator("title", "text", mode="before")
    @classmethod
    def _default_str(cls, value: Any) -> str:
        return "" if value is None else str(value)

    @field_validator("ending", mode="before")
    @classmethod
    def _clean_ending(cls, value: Any) -> Ending | None:
        if value in ("win", "lose"):
            return value
        return None


class QuestImport(BaseModel):
    title: str = Field(default="Импортированный квест", max_length=200)
    description: str = Field(default="", max_length=5000)
    start_scene_id: Any = None
    initial_variables: dict[str, Any] = Field(default_factory=dict)
    scenes: list[SceneImport] = Field(default_factory=list)

    @field_validator("title", mode="before")
    @classmethod
    def _clean_title(cls, value: Any) -> str:
        if value is None:
            return "Импортированный квест"
        cleaned = str(value).strip()
        return cleaned or "Импортированный квест"

    @field_validator("description", mode="before")
    @classmethod
    def _clean_desc(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    @field_validator("initial_variables", mode="before")
    @classmethod
    def _clean_vars(cls, value: Any) -> dict[str, Any]:
        return value if isinstance(value, dict) else {}


# ---------- Проверка квеста ----------


class Issue(BaseModel):
    level: Literal["error", "warning", "info"]
    message: str
    scene_id: int | None = None
    choice_id: int | None = None


class ValidationReport(BaseModel):
    ok: bool
    issues: list[Issue]
    items: list[str]
    variables: list[str] = Field(default_factory=list)
    reachable_scene_ids: list[int]


# ---------- Игра ----------


class StartRequest(BaseModel):
    quest_id: int


class ActionRequest(BaseModel):
    choice_id: int


class SceneView(BaseModel):
    id: int
    title: str
    text: str
    ending: Ending | None
    image_url: str | None = None
    audio_url: str | None = None


class ChoiceView(BaseModel):
    id: int
    text: str
    available: bool
    required_item: str | None = None
    lock_reason: str | None = None


class LogEntry(BaseModel):
    scene_id: int
    scene_title: str
    choice_text: str


class GameState(BaseModel):
    session_id: str
    quest_id: int
    quest_title: str
    status: GameStatus
    scene: SceneView
    choices: list[ChoiceView]
    inventory: list[str]
    variables: dict[str, Any] = Field(default_factory=dict)
    steps: int
    visited: int
    total_scenes: int
    can_undo: bool = False
    log: list[LogEntry] = Field(default_factory=list)
    message: str | None = None
    new_items: list[str] = Field(default_factory=list)
