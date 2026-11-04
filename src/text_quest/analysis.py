"""Проверка квеста на типичные ошибки автора (для конструктора)."""

from __future__ import annotations

import re
from collections import defaultdict

from .models import Choice, Quest, Scene
from .schemas import Issue, ValidationReport

_LEVEL_ORDER = {"error": 0, "warning": 1, "info": 2}
_VAR_PATTERN = re.compile(r"\{([a-zA-Z0-9_\u0400-\u04FF]+)\}")
_VALID_OPS = {"==", "!=", ">", ">=", "<", "<="}


def scene_label(scene: Scene) -> str:
    return scene.title.strip() or f"Сцена #{scene.id}"


def _has_meaningful_action(choice: Choice) -> bool:
    if choice.item_given and choice.item_given.strip():
        return True
    acts = choice.actions
    if not isinstance(acts, dict) or not acts:
        return False
    for item_key in ("give_item", "take_item"):
        val = acts.get(item_key)
        if isinstance(val, str) and val.strip():
            return True
    for dict_key in ("set", "add"):
        val = acts.get(dict_key)
        if isinstance(val, dict) and len(val) > 0:
            return True
    return False


def analyze_quest(quest: Quest, scenes: list[Scene], choices: list[Choice]) -> ValidationReport:
    issues: list[Issue] = []
    by_id = {s.id: s for s in scenes if s.id is not None}
    by_scene: dict[int, list[Choice]] = defaultdict(list)
    for choice in choices:
        by_scene[choice.scene_id].append(choice)

    if not scenes:
        issues.append(Issue(level="error", message="В квесте нет ни одной сцены."))

    start_id = quest.start_scene_id if quest.start_scene_id in by_id else None
    if scenes and start_id is None:
        issues.append(Issue(level="error", message="Не выбрана стартовая сцена."))

    # Достижимость считаем по графу переходов
    reachable: set[int] = set()
    stack = [start_id] if start_id is not None else []
    while stack:
        sid = stack.pop()
        if sid in reachable:
            continue
        reachable.add(sid)
        if by_id[sid].ending:
            continue
        for choice in by_scene[sid]:
            if choice.target_scene_id in by_id:
                stack.append(choice.target_scene_id)

    reachable_given_items: set[str] = set()
    all_given_items: set[str] = set()
    all_items: set[str] = set()
    all_vars = set((quest.initial_variables or {}).keys())

    for choice in choices:
        parent_scene = by_id.get(choice.scene_id)
        is_active_scene = parent_scene is not None and not parent_scene.ending
        is_reachable = is_active_scene and (start_id is None or parent_scene.id in reachable)

        items_given_here: list[str] = []
        if choice.item_given:
            items_given_here.append(choice.item_given)
            all_items.add(choice.item_given)
        if choice.required_item:
            all_items.add(choice.required_item)

        acts = choice.actions or {}
        if isinstance(acts, dict):
            give_act = acts.get("give_item")
            if isinstance(give_act, str) and give_act.strip():
                items_given_here.append(give_act.strip())
                all_items.add(give_act.strip())
            elif isinstance(give_act, list):
                for gitm in give_act:
                    if str(gitm).strip():
                        items_given_here.append(str(gitm).strip())
                        all_items.add(str(gitm).strip())
            take_act = acts.get("take_item")
            if isinstance(take_act, str) and take_act.strip():
                all_items.add(take_act.strip())
            elif isinstance(take_act, list):
                for titm in take_act:
                    if str(titm).strip():
                        all_items.add(str(titm).strip())
            for section in ("set", "add"):
                if isinstance(acts.get(section), dict):
                    all_vars.update(str(k) for k in acts[section].keys() if str(k).strip())

        for item_name in items_given_here:
            if is_active_scene:
                all_given_items.add(item_name)
            if is_reachable:
                reachable_given_items.add(item_name)

        for cond in (choice.conditions or []):
            if isinstance(cond, dict):
                c_item = cond.get("item")
                if isinstance(c_item, str) and c_item.strip():
                    all_items.add(c_item.strip())

    for scene in scenes:
        label = scene_label(scene)
        scene_choices = by_scene[scene.id]

        if start_id is not None and scene.id not in reachable:
            issues.append(Issue(level="warning", scene_id=scene.id,
                                message=f"«{label}»: до сцены нельзя добраться из стартовой."))
        if not scene.text.strip():
            issues.append(Issue(level="warning", scene_id=scene.id,
                                message=f"«{label}»: у сцены нет текста."))

        # Проверка переменных {var} в заголовке и тексте сцены
        seen_unknown_vars: set[str] = set()
        for text_source in (scene.title, scene.text):
            for match in _VAR_PATTERN.finditer(text_source or ""):
                v_name = match.group(1)
                if v_name not in all_vars and v_name not in seen_unknown_vars:
                    seen_unknown_vars.add(v_name)
                    issues.append(Issue(
                        level="warning",
                        scene_id=scene.id,
                        message=f"«{label}»: в тексте упоминается переменная «{{{v_name}}}», которая нигде не определена.",
                    ))

        if scene.ending:
            if scene_choices:
                issues.append(Issue(level="info", scene_id=scene.id,
                                    message=f"«{label}»: это концовка — варианты выбора игроку не показываются."))
            continue

        if not scene_choices:
            issues.append(Issue(level="warning", scene_id=scene.id,
                                message=f"«{label}»: тупик — нет вариантов выбора, а сцена не отмечена как концовка."))
        elif all(c.target_scene_id in (None, scene.id) for c in scene_choices):
            issues.append(Issue(level="warning", scene_id=scene.id,
                                message=f"«{label}»: тупик — все варианты выбора остаются в этой же сцене."))

        for choice in scene_choices:
            if not choice.text.strip():
                issues.append(Issue(level="warning", scene_id=scene.id, choice_id=choice.id,
                                    message=f"«{label}»: у варианта выбора нет текста."))
            else:
                for match in _VAR_PATTERN.finditer(choice.text):
                    v_name = match.group(1)
                    if v_name not in all_vars:
                        issues.append(Issue(
                            level="warning",
                            scene_id=scene.id,
                            choice_id=choice.id,
                            message=f"«{label}»: в варианте выбора упоминается переменная «{{{v_name}}}», которая нигде не определена.",
                        ))

            if choice.target_scene_id is not None and choice.target_scene_id not in by_id:
                issues.append(Issue(
                    level="error",
                    scene_id=scene.id,
                    choice_id=choice.id,
                    message=f"«{label}»: вариант «{choice.text or '…'}» ведёт на несуществующую в этом квесте сцену #{choice.target_scene_id}.",
                ))

            has_action = _has_meaningful_action(choice)
            stays_in_scene = choice.target_scene_id is None or choice.target_scene_id == scene.id
            if stays_in_scene and not has_action:
                issues.append(Issue(level="warning", scene_id=scene.id, choice_id=choice.id,
                                    message=f"«{label}»: вариант «{choice.text or '…'}» никуда не ведёт и ничего не меняет."))
            if choice.required_item:
                if choice.required_item not in all_given_items:
                    issues.append(Issue(level="error", scene_id=scene.id, choice_id=choice.id,
                                        message=f"«{label}»: предмет «{choice.required_item}» нигде не выдаётся — "
                                                f"вариант всегда будет заблокирован."))
                elif start_id is not None and scene.id in reachable and choice.required_item not in reachable_given_items:
                    issues.append(Issue(level="error", scene_id=scene.id, choice_id=choice.id,
                                        message=f"«{label}»: предмет «{choice.required_item}» выдаётся только в недостижимой сцене — "
                                                f"вариант будет заблокирован."))

            # Проверка расширенных условий на неизвестные переменные, предметы и операторы
            for cond in (choice.conditions or []):
                if not isinstance(cond, dict):
                    continue
                c_item = cond.get("item")
                if isinstance(c_item, str) and c_item.strip() and cond.get("has", True):
                    item_name = c_item.strip()
                    if item_name not in all_given_items:
                        issues.append(Issue(
                            level="error",
                            scene_id=scene.id,
                            choice_id=choice.id,
                            message=f"«{label}»: предмет «{item_name}» в условии нигде не выдаётся — "
                                    f"вариант всегда будет заблокирован.",
                        ))
                    elif start_id is not None and scene.id in reachable and item_name not in reachable_given_items:
                        issues.append(Issue(
                            level="error",
                            scene_id=scene.id,
                            choice_id=choice.id,
                            message=f"«{label}»: предмет «{item_name}» в условии выдаётся только в недостижимой сцене — "
                                    f"вариант будет заблокирован.",
                        ))
                v_name = cond.get("var")
                if v_name:
                    if v_name not in all_vars:
                        issues.append(Issue(level="warning", scene_id=scene.id, choice_id=choice.id,
                                            message=f"«{label}»: условие проверяет переменную «{v_name}», которая нигде не определена."))
                    op = cond.get("op", "==")
                    if op not in _VALID_OPS:
                        issues.append(Issue(
                            level="warning",
                            scene_id=scene.id,
                            choice_id=choice.id,
                            message=f"«{label}»: неизвестный оператор сравнения «{op}» в условии для «{v_name}».",
                        ))

    win_scenes = [s for s in scenes if s.ending == "win"]
    if scenes and not win_scenes:
        issues.append(Issue(level="warning", message="В квесте нет ни одной победной концовки."))
    elif start_id is not None and not any(s.id in reachable for s in win_scenes):
        issues.append(Issue(level="warning", message="Из стартовой сцены невозможно добраться ни до одной победной концовки."))

    issues.sort(key=lambda i: _LEVEL_ORDER[i.level])
    return ValidationReport(
        ok=not any(i.level == "error" for i in issues),
        issues=issues,
        items=sorted(all_items),
        variables=sorted(all_vars),
        reachable_scene_ids=sorted(reachable),
    )
