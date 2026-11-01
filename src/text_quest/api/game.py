"""Игровое API: запуск сессии, текущее состояние и совершение действий с поддержкой переменных."""

from __future__ import annotations

import math
import re
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, col, select

from ..db import SessionDep
from ..models import Choice, GameSession, Quest, Scene
from ..schemas import ActionRequest, ChoiceView, GameState, LogEntry, SceneView, StartRequest

router = APIRouter(prefix="/api/game", tags=["Игра"])

_VAR_INTERP_RE = re.compile(r"\{([a-zA-Z0-9_\u0400-\u04FF]+)\}")


def _to_number(val: Any) -> float | None:
    if isinstance(val, bool) or val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val) if math.isfinite(val) else None
    if isinstance(val, str):
        s = val.strip()
        if not s:
            return None
        try:
            num = float(s)
            return num if math.isfinite(num) else None
        except ValueError:
            return None
    return None


def _eval_op(a: Any, op: str, b: Any) -> bool:
    num_a = _to_number(a)
    num_b = _to_number(b)

    if op in ("==", "!="):
        if isinstance(a, bool) or isinstance(b, bool):
            eq = (a is b) if (isinstance(a, bool) and isinstance(b, bool)) else (str(a).lower() == str(b).lower())
        elif num_a is not None and num_b is not None:
            eq = num_a == num_b
        else:
            eq = str(a) == str(b) if (a is not None and b is not None) else (a == b)
        return eq if op == "==" else not eq

    if num_a is None or num_b is None:
        return False

    if op == ">":
        return num_a > num_b
    if op == ">=":
        return num_a >= num_b
    if op == "<":
        return num_a < num_b
    if op == "<=":
        return num_a <= num_b
    return False


def evaluate_choice(choice: Choice, inventory: list[str], variables: dict[str, Any]) -> tuple[bool, str | None]:
    """Проверяет выполнимость условий выбора и формирует человекочитаемую причину блокировки."""
    if choice.required_item and choice.required_item not in inventory:
        return False, f"Нужен предмет: «{choice.required_item}»"

    for cond in (choice.conditions or []):
        if not isinstance(cond, dict):
            continue
        c_type = cond.get("type")
        if c_type == "item" or "item" in cond:
            item_name = str(cond.get("item") or "").strip()
            if not item_name:
                continue
            has = cond.get("has", True)
            if has and item_name not in inventory:
                return False, f"Нужен предмет: «{item_name}»"
            if not has and item_name in inventory:
                return False, f"Не должно быть предмета: «{item_name}»"
        elif c_type == "var" or "var" in cond:
            var_name = str(cond.get("var") or "").strip()
            if not var_name:
                continue
            op = cond.get("op", "==")
            val = cond.get("value")
            cur = variables.get(var_name, 0)
            if not _eval_op(cur, op, val):
                return False, f"Требуется: {var_name} {op} {val} (сейчас: {cur})"

    return True, None


def interpolate_text(text: str, variables: dict[str, Any]) -> str:
    """Подставляет значения переменных в текст {var_name}."""
    if not text or "{" not in text:
        return text

    def _replace(match: re.Match) -> str:
        var_name = match.group(1).strip()
        if var_name in variables:
            val = variables[var_name]
            if isinstance(val, bool):
                return "да" if val else "нет"
            return str(val)
        return match.group(0)

    return _VAR_INTERP_RE.sub(_replace, text)


def _scene_choices(db: Session, scene_id: int) -> list[Choice]:
    stmt = select(Choice).where(Choice.scene_id == scene_id).order_by(col(Choice.id))
    return list(db.exec(stmt).all())


def _has_other_actions(actions: dict[str, Any] | None) -> bool:
    if not isinstance(actions, dict):
        return False
    if isinstance(actions.get("take_item"), str) and actions["take_item"].strip():
        return True
    if isinstance(actions.get("set"), dict) and len(actions["set"]) > 0:
        return True
    if isinstance(actions.get("add"), dict) and len(actions["add"]) > 0:
        return True
    return False


def _visible_choices(
    choices: list[Choice],
    inventory: list[str],
    current_scene_id: int | None = None,
) -> list[Choice]:
    """Скрываем «подобрать предмет», если предмет уже у игрока и выбор остаётся в текущей сцене без других эффектов."""
    result = []
    for c in choices:
        acts = c.actions if isinstance(c.actions, dict) else {}
        give_act = acts.get("give_item")
        gives_item = c.item_given or (give_act.strip() if isinstance(give_act, str) and give_act.strip() else None)
        stays_in_scene = c.target_scene_id is None or (current_scene_id is not None and c.target_scene_id == current_scene_id)
        if stays_in_scene and gives_item and gives_item in inventory and not _has_other_actions(acts):
            continue
        result.append(c)
    return result


def _current_scene(db: Session, game: GameSession) -> Scene:
    scene = db.get(Scene, game.current_scene_id) if game.current_scene_id is not None else None
    if scene is None or scene.quest_id != game.quest_id:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Текущая сцена была удалена автором квеста. Начните игру заново.",
        )
    return scene


def _get_game_or_404(db: Session, session_id: str) -> GameSession:
    game = db.get(GameSession, session_id)
    if game is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Игровая сессия не найдена")
    return game


def build_state(db: Session, game: GameSession, message: str | None = None,
                new_items: list[str] | None = None) -> GameState:
    quest = db.get(Quest, game.quest_id)
    if quest is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Квест не найден")
    scene = _current_scene(db, game)
    inventory = list(game.inventory or [])
    variables = dict(game.variables or {})
    total = db.exec(select(func.count()).select_from(Scene).where(Scene.quest_id == quest.id)).one()

    views: list[ChoiceView] = []
    if scene.ending:
        game_status = scene.ending
    else:
        for c in _visible_choices(_scene_choices(db, scene.id), inventory, scene.id):
            avail, reason = evaluate_choice(c, inventory, variables)
            views.append(ChoiceView(
                id=c.id,
                text=interpolate_text(c.text, variables),
                available=avail,
                required_item=c.required_item,
                lock_reason=reason,
            ))
        game_status = "playing" if views else "end"

    interpolated_title = interpolate_text(scene.title, variables)
    interpolated_text = interpolate_text(scene.text, variables)

    log_entries = [
        LogEntry(
            scene_id=entry.get("scene_id", 0),
            scene_title=entry.get("scene_title", ""),
            choice_text=entry.get("choice_text", ""),
        )
        for entry in (game.log or [])
    ]

    return GameState(
        session_id=game.id,
        quest_id=quest.id,
        quest_title=quest.title,
        status=game_status,
        scene=SceneView(
            id=scene.id,
            title=interpolated_title,
            text=interpolated_text,
            ending=scene.ending,
            image_url=scene.image_url,
            audio_url=scene.audio_url,
        ),
        choices=views,
        inventory=inventory,
        variables=variables,
        steps=game.steps,
        visited=len(game.history or []),
        total_scenes=total,
        can_undo=len(game.snapshots or []) > 0,
        log=log_entries,
        message=message,
        new_items=new_items or [],
    )


@router.post("/start", response_model=GameState, status_code=status.HTTP_201_CREATED,
             summary="Начать новую игру")
def start_game(data: StartRequest, db: SessionDep):
    quest = db.get(Quest, data.quest_id)
    if quest is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Квест не найден")
    start = db.get(Scene, quest.start_scene_id) if quest.start_scene_id is not None else None
    if start is None or start.quest_id != quest.id:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "У квеста не задана стартовая сцена — откройте конструктор и выберите её.")
    init_vars = dict(quest.initial_variables or {})
    game = GameSession(
        quest_id=quest.id,
        current_scene_id=start.id,
        inventory=[],
        variables=init_vars,
        history=[start.id],
        snapshots=[],
        log=[],
    )
    db.add(game)
    db.commit()
    db.refresh(game)
    return build_state(db, game)


@router.get("/{session_id}", response_model=GameState, summary="Текущее состояние игры")
def get_game(session_id: str, db: SessionDep):
    return build_state(db, _get_game_or_404(db, session_id))


@router.post("/{session_id}/action", response_model=GameState, summary="Сделать выбор")
def make_action(session_id: str, data: ActionRequest, db: SessionDep):
    game = _get_game_or_404(db, session_id)
    scene = _current_scene(db, game)
    if scene.ending:
        raise HTTPException(status.HTTP_409_CONFLICT, "Игра уже окончена. Начните заново.")

    inventory = list(game.inventory or [])
    variables = dict(game.variables or {})
    choice = db.get(Choice, data.choice_id)
    visible_choices = _visible_choices(_scene_choices(db, scene.id), inventory, scene.id)
    visible_ids = {c.id for c in visible_choices}
    if choice is None or choice.id not in visible_ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Этот вариант недоступен в текущей сцене.")

    available, reason = evaluate_choice(choice, inventory, variables)
    if not available:
        raise HTTPException(status.HTTP_403_FORBIDDEN, reason or "Выбор заблокирован.")

    # Сохраняем снимок перед ходом для функции Undo
    snapshots = list(game.snapshots or [])
    snapshots.append({
        "current_scene_id": game.current_scene_id,
        "inventory": list(inventory),
        "variables": dict(variables),
        "history": list(game.history or []),
        "steps": game.steps,
    })
    # Ограничиваем глубину истории (до 30 ходов), чтобы сессия не раздувалась
    if len(snapshots) > 30:
        snapshots = snapshots[-30:]

    new_items: list[str] = []
    actions = choice.actions if isinstance(choice.actions, dict) else {}

    # Предметы
    give_act = actions.get("give_item")
    item_to_give = choice.item_given or (give_act.strip() if isinstance(give_act, str) and give_act.strip() else None)
    if item_to_give and item_to_give not in inventory:
        inventory.append(item_to_give)
        new_items.append(item_to_give)

    take_act = actions.get("take_item")
    item_to_take = take_act.strip() if isinstance(take_act, str) and take_act.strip() else None
    if item_to_take and item_to_take in inventory:
        inventory.remove(item_to_take)

    # Переменные (set, add)
    if isinstance(actions.get("set"), dict):
        for k, v in actions["set"].items():
            variables[k] = v

    if isinstance(actions.get("add"), dict):
        for k, v in actions["add"].items():
            cur_num = _to_number(variables.get(k, 0))
            delta_num = _to_number(v)
            if cur_num is not None and delta_num is not None:
                res = round(cur_num + delta_num, 10)
                variables[k] = int(res) if res.is_integer() else res
            elif delta_num is not None:
                variables[k] = int(delta_num) if delta_num.is_integer() else delta_num
            else:
                variables[k] = v

    message = None
    history = list(game.history or [])
    if choice.target_scene_id is not None and choice.target_scene_id != scene.id:
        target = db.get(Scene, choice.target_scene_id)
        if target is None or target.quest_id != game.quest_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "Целевая сцена не найдена.")
        game.current_scene_id = target.id
        if target.id not in history:
            history.append(target.id)
    elif not new_items:
        message = "Действие выполнено."

    log = list(game.log or [])
    log.append({
        "scene_id": scene.id,
        "scene_title": scene.title or f"Сцена #{scene.id}",
        "choice_text": interpolate_text(choice.text, variables),
    })

    game.inventory = inventory
    game.variables = variables
    game.history = history
    game.snapshots = snapshots
    game.log = log
    game.steps += 1
    game.updated_at = datetime.now(UTC)
    db.add(game)
    db.commit()
    db.refresh(game)
    return build_state(db, game, message=message, new_items=new_items)


@router.post("/{session_id}/undo", response_model=GameState, summary="Отменить последний ход")
def undo_action(session_id: str, db: SessionDep):
    game = _get_game_or_404(db, session_id)
    snapshots = list(game.snapshots or [])
    if not snapshots:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Нет ходов для отмены")

    last_snap = snapshots.pop()
    game.current_scene_id = last_snap["current_scene_id"]
    game.inventory = last_snap["inventory"]
    game.variables = last_snap["variables"]
    game.history = last_snap["history"]
    game.steps = last_snap["steps"]
    game.snapshots = snapshots
    if game.log:
        game.log = game.log[:-1]
    game.updated_at = datetime.now(UTC)

    db.add(game)
    db.commit()
    db.refresh(game)
    return build_state(db, game, message="Ход отменён.")
