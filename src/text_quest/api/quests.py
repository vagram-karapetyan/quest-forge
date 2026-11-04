"""CRUD API конструктора: квесты, сцены, варианты выбора, экспорт и импорт."""

from __future__ import annotations

import json
from collections import defaultdict
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Response, status
from sqlmodel import Session, col, select

from ..analysis import analyze_quest
from ..auth import AdminDep
from ..db import SessionDep
from ..export import generate_standalone_html, quest_to_dict
from ..models import Choice, Quest, Scene
from ..schemas import (
    ChoiceCreate,
    ChoiceRead,
    ChoiceUpdate,
    QuestCreate,
    QuestDetail,
    QuestImport,
    QuestRead,
    QuestSummary,
    QuestUpdate,
    SceneCreate,
    SceneDetail,
    SceneRead,
    SceneUpdate,
    ValidationReport,
)

router = APIRouter(prefix="/api", tags=["Конструктор"])


# ---------- helpers ----------


def get_quest_or_404(db: Session, quest_id: int) -> Quest:
    quest = db.get(Quest, quest_id)
    if quest is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Квест не найден")
    return quest


def get_scene_or_404(db: Session, scene_id: int) -> Scene:
    scene = db.get(Scene, scene_id)
    if scene is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Сцена не найдена")
    return scene


def get_choice_or_404(db: Session, choice_id: int) -> Choice:
    choice = db.get(Choice, choice_id)
    if choice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Вариант выбора не найден")
    return choice


def quest_scenes(db: Session, quest_id: int) -> list[Scene]:
    return list(db.exec(select(Scene).where(Scene.quest_id == quest_id).order_by(col(Scene.id))).all())


def scenes_choices(db: Session, scene_ids: list[int]) -> list[Choice]:
    if not scene_ids:
        return []
    stmt = select(Choice).where(col(Choice.scene_id).in_(scene_ids)).order_by(col(Choice.id))
    return list(db.exec(stmt).all())


def ensure_scene_in_quest(db: Session, scene_id: int | None, quest_id: int, what: str) -> None:
    if scene_id is None:
        return
    scene = db.get(Scene, scene_id)
    if scene is None or scene.quest_id != quest_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"{what} должна принадлежать этому же квесту")


def scene_detail(scene: Scene, choices: list[Choice]) -> SceneDetail:
    return SceneDetail(
        **SceneRead.model_validate(scene).model_dump(),
        choices=[ChoiceRead.model_validate(c) for c in choices],
    )


# ---------- quests ----------


@router.get("/quests", response_model=list[QuestSummary], summary="Каталог квестов")
def list_quests(db: SessionDep):
    quests = db.exec(select(Quest).order_by(col(Quest.id))).all()
    by_quest: dict[int, list[Scene]] = defaultdict(list)
    for scene in db.exec(select(Scene)).all():
        by_quest[scene.quest_id].append(scene)

    result = []
    for quest in quests:
        scenes = by_quest[quest.id]
        result.append(QuestSummary(
            id=quest.id,
            title=quest.title,
            description=quest.description,
            start_scene_id=quest.start_scene_id,
            initial_variables=quest.initial_variables or {},
            scene_count=len(scenes),
            win_endings=sum(s.ending == "win" for s in scenes),
            lose_endings=sum(s.ending == "lose" for s in scenes),
            playable=any(s.id == quest.start_scene_id for s in scenes),
        ))
    return result


@router.post("/quests", response_model=QuestRead, status_code=status.HTTP_201_CREATED, summary="Создать квест")
def create_quest(data: QuestCreate, db: SessionDep, _auth: AdminDep):
    quest = Quest(
        title=data.title,
        description=data.description,
        initial_variables=data.initial_variables,
    )
    db.add(quest)
    db.flush()
    # Сразу создаём стартовую сцену, чтобы конструктор не был пустым.
    scene = Scene(quest_id=quest.id, title="Начало", text="", pos_x=100.0, pos_y=100.0)
    db.add(scene)
    db.flush()
    quest.start_scene_id = scene.id
    db.commit()
    db.refresh(quest)
    return quest


@router.get("/quests/{quest_id}", response_model=QuestDetail, summary="Квест со всеми сценами и выборами")
def get_quest(quest_id: int, db: SessionDep):
    quest = get_quest_or_404(db, quest_id)
    scenes = quest_scenes(db, quest_id)
    by_scene: dict[int, list[Choice]] = defaultdict(list)
    for choice in scenes_choices(db, [s.id for s in scenes]):
        by_scene[choice.scene_id].append(choice)
    return QuestDetail(
        **QuestRead.model_validate(quest).model_dump(),
        scenes=[scene_detail(s, by_scene[s.id]) for s in scenes],
    )


@router.post("/quests/{quest_id}/duplicate", response_model=QuestRead, status_code=status.HTTP_201_CREATED, summary="Дублировать квест")
def duplicate_quest(quest_id: int, db: SessionDep, _auth: AdminDep):
    original = get_quest_or_404(db, quest_id)
    orig_scenes = quest_scenes(db, quest_id)
    orig_choices = scenes_choices(db, [s.id for s in orig_scenes])

    copy_quest = Quest(
        title=f"{original.title} (Копия)",
        description=original.description,
        initial_variables=dict(original.initial_variables or {}),
    )
    db.add(copy_quest)
    db.flush()

    old_to_new_scene_id: dict[int, int] = {}
    for s in orig_scenes:
        ns = Scene(
            quest_id=copy_quest.id,
            title=s.title,
            text=s.text,
            ending=s.ending,
            pos_x=s.pos_x,
            pos_y=s.pos_y,
            image_url=s.image_url,
            audio_url=s.audio_url,
        )
        db.add(ns)
        db.flush()
        if s.id is not None:
            old_to_new_scene_id[s.id] = ns.id

    for c in orig_choices:
        new_scene_id = old_to_new_scene_id.get(c.scene_id)
        if not new_scene_id:
            continue
        new_target_id = old_to_new_scene_id.get(c.target_scene_id) if c.target_scene_id is not None else None
        nc = Choice(
            scene_id=new_scene_id,
            text=c.text,
            target_scene_id=new_target_id,
            required_item=c.required_item,
            item_given=c.item_given,
            conditions=list(c.conditions or []),
            actions=dict(c.actions or {}),
        )
        db.add(nc)

    if original.start_scene_id in old_to_new_scene_id:
        copy_quest.start_scene_id = old_to_new_scene_id[original.start_scene_id]

    db.add(copy_quest)
    db.commit()
    db.refresh(copy_quest)
    return copy_quest


@router.patch("/quests/{quest_id}", response_model=QuestRead, summary="Изменить квест")
def update_quest(quest_id: int, data: QuestUpdate, db: SessionDep, _auth: AdminDep):
    quest = get_quest_or_404(db, quest_id)
    changes = data.model_dump(exclude_unset=True)
    if "title" in changes and changes["title"] is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Название квеста не может быть пустым")
    if "description" in changes and changes["description"] is None:
        changes["description"] = ""
    if "start_scene_id" in changes:
        ensure_scene_in_quest(db, changes["start_scene_id"], quest.id, "Стартовая сцена")
    for key, value in changes.items():
        setattr(quest, key, value)
    db.add(quest)
    db.commit()
    db.refresh(quest)
    return quest


@router.delete("/quests/{quest_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить квест")
def delete_quest(quest_id: int, db: SessionDep, _auth: AdminDep):
    quest = get_quest_or_404(db, quest_id)
    db.delete(quest)  # каскадное удаление сцен, выборов и игровых сессий через внешние ключи SQLite
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/quests/{quest_id}/validate", response_model=ValidationReport, summary="Проверить квест")
def validate_quest(quest_id: int, db: SessionDep):
    quest = get_quest_or_404(db, quest_id)
    scenes = quest_scenes(db, quest_id)
    choices = scenes_choices(db, [s.id for s in scenes])
    return analyze_quest(quest, scenes, choices)


# ---------- Экспорт и Импорт ----------


@router.get("/quests/{quest_id}/export/json", summary="Экспорт квеста в JSON")
def export_quest_json(quest_id: int, db: SessionDep):
    quest = get_quest_or_404(db, quest_id)
    scenes = quest_scenes(db, quest_id)
    choices = scenes_choices(db, [s.id for s in scenes])
    data = quest_to_dict(quest, scenes, choices)
    ascii_filename = f"quest_{quest.id}.json"
    encoded_filename = quote(f"{quest.title}.json")
    return Response(
        content=json.dumps(data, ensure_ascii=False, indent=2),
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{ascii_filename}"; filename*=UTF-8\'\'{encoded_filename}'},
    )


@router.get("/quests/{quest_id}/export/html", summary="Экспорт в Standalone HTML")
def export_quest_html(quest_id: int, db: SessionDep):
    quest = get_quest_or_404(db, quest_id)
    scenes = quest_scenes(db, quest_id)
    choices = scenes_choices(db, [s.id for s in scenes])
    html_content = generate_standalone_html(quest, scenes, choices)
    ascii_filename = f"quest_{quest.id}.html"
    encoded_filename = quote(f"{quest.title}.html")
    return Response(
        content=html_content,
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{ascii_filename}"; filename*=UTF-8\'\'{encoded_filename}'},
    )


@router.post("/quests/import", response_model=QuestRead, status_code=status.HTTP_201_CREATED, summary="Импорт квеста из JSON")
def import_quest(payload: QuestImport, db: SessionDep, _auth: AdminDep):
    quest = Quest(
        title=payload.title,
        description=payload.description,
        initial_variables=payload.initial_variables,
    )
    db.add(quest)
    db.flush()

    old_to_new_scene_id: dict[Any, int] = {}
    created_scenes: list[tuple[Scene, list]] = []

    for idx, s in enumerate(payload.scenes):
        default_x = 60.0 + (idx % 4) * 280.0
        default_y = 60.0 + (idx // 4) * 160.0
        scene = Scene(
            quest_id=quest.id,
            title=s.title,
            text=s.text,
            ending=s.ending,
            pos_x=s.pos_x if s.pos_x is not None else default_x,
            pos_y=s.pos_y if s.pos_y is not None else default_y,
            image_url=s.image_url,
            audio_url=s.audio_url,
        )
        db.add(scene)
        db.flush()
        if s.id is not None and scene.id is not None:
            old_to_new_scene_id[s.id] = scene.id
            old_to_new_scene_id[str(s.id)] = scene.id
            if isinstance(s.id, str) and s.id.isdigit():
                old_to_new_scene_id[int(s.id)] = scene.id
        created_scenes.append((scene, s.choices))

    for scene, raw_choices in created_scenes:
        for c in raw_choices:
            new_target_id = None
            if c.target_scene_id is not None:
                new_target_id = old_to_new_scene_id.get(c.target_scene_id)
                if new_target_id is None:
                    new_target_id = old_to_new_scene_id.get(str(c.target_scene_id))
            choice = Choice(
                scene_id=scene.id,
                text=c.text,
                target_scene_id=new_target_id,
                required_item=c.required_item,
                item_given=c.item_given,
                conditions=c.conditions,
                actions=c.actions,
            )
            db.add(choice)

    if payload.start_scene_id is not None:
        if payload.start_scene_id in old_to_new_scene_id:
            quest.start_scene_id = old_to_new_scene_id[payload.start_scene_id]
        elif str(payload.start_scene_id) in old_to_new_scene_id:
            quest.start_scene_id = old_to_new_scene_id[str(payload.start_scene_id)]
    elif created_scenes:
        quest.start_scene_id = created_scenes[0][0].id

    db.add(quest)
    db.commit()
    db.refresh(quest)
    return quest


# ---------- scenes ----------


@router.get("/quests/{quest_id}/scenes", response_model=list[SceneRead], summary="Сцены квеста")
def list_scenes(quest_id: int, db: SessionDep):
    get_quest_or_404(db, quest_id)
    return quest_scenes(db, quest_id)


@router.post("/quests/{quest_id}/scenes", response_model=SceneRead,
             status_code=status.HTTP_201_CREATED, summary="Добавить сцену")
def create_scene(quest_id: int, data: SceneCreate, db: SessionDep, _auth: AdminDep):
    quest = get_quest_or_404(db, quest_id)
    scene = Scene(quest_id=quest.id, **data.model_dump())
    db.add(scene)
    db.flush()
    if quest.start_scene_id is None:
        quest.start_scene_id = scene.id
        db.add(quest)
    db.commit()
    db.refresh(scene)
    return scene


@router.post("/scenes/{scene_id}/duplicate", response_model=SceneDetail, status_code=status.HTTP_201_CREATED, summary="Дублировать сцену")
def duplicate_scene(scene_id: int, db: SessionDep, _auth: AdminDep):
    scene = get_scene_or_404(db, scene_id)
    choices = scenes_choices(db, [scene.id])

    new_scene = Scene(
        quest_id=scene.quest_id,
        title=f"{scene.title} (Копия)",
        text=scene.text,
        ending=scene.ending,
        pos_x=(scene.pos_x or 60.0) + 40.0,
        pos_y=(scene.pos_y or 60.0) + 40.0,
        image_url=scene.image_url,
        audio_url=scene.audio_url,
    )
    db.add(new_scene)
    db.flush()

    new_choices = []
    for c in choices:
        new_target = new_scene.id if c.target_scene_id == scene.id else c.target_scene_id
        nc = Choice(
            scene_id=new_scene.id,
            text=c.text,
            target_scene_id=new_target,
            required_item=c.required_item,
            item_given=c.item_given,
            conditions=[dict(x) for x in (c.conditions or [])],
            actions=dict(c.actions or {}),
        )
        db.add(nc)
        db.flush()
        new_choices.append(nc)

    db.commit()
    db.refresh(new_scene)
    return scene_detail(new_scene, new_choices)


@router.get("/scenes/{scene_id}", response_model=SceneDetail, summary="Сцена с вариантами выбора")
def get_scene(scene_id: int, db: SessionDep):
    scene = get_scene_or_404(db, scene_id)
    return scene_detail(scene, scenes_choices(db, [scene.id]))


@router.patch("/scenes/{scene_id}", response_model=SceneRead, summary="Изменить сцену")
def update_scene(scene_id: int, data: SceneUpdate, db: SessionDep, _auth: AdminDep):
    scene = get_scene_or_404(db, scene_id)
    changes = data.model_dump(exclude_unset=True)
    for key in ("title", "text"):
        if key in changes and changes[key] is None:
            changes[key] = ""
    for key, value in changes.items():
        setattr(scene, key, value)
    db.add(scene)
    db.commit()
    db.refresh(scene)
    return scene


@router.delete("/scenes/{scene_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить сцену")
def delete_scene(scene_id: int, db: SessionDep, _auth: AdminDep):
    scene = get_scene_or_404(db, scene_id)
    quest = db.get(Quest, scene.quest_id)
    if quest is not None and quest.start_scene_id == scene.id:
        other = db.exec(
            select(Scene)
            .where(Scene.quest_id == quest.id, Scene.id != scene.id)
            .order_by(col(Scene.id))
        ).first()
        quest.start_scene_id = other.id if other else None
        db.add(quest)
    # Варианты этой сцены удалятся каскадно, а ссылки на неё обнулятся (ON DELETE SET NULL).
    db.delete(scene)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- choices ----------


@router.get("/scenes/{scene_id}/choices", response_model=list[ChoiceRead], summary="Варианты выбора сцены")
def list_choices(scene_id: int, db: SessionDep):
    get_scene_or_404(db, scene_id)
    return scenes_choices(db, [scene_id])


@router.post("/scenes/{scene_id}/choices", response_model=ChoiceRead,
             status_code=status.HTTP_201_CREATED, summary="Добавить вариант выбора")
def create_choice(scene_id: int, data: ChoiceCreate, db: SessionDep, _auth: AdminDep):
    scene = get_scene_or_404(db, scene_id)
    ensure_scene_in_quest(db, data.target_scene_id, scene.quest_id, "Целевая сцена")
    choice = Choice(scene_id=scene.id, **data.model_dump())
    db.add(choice)
    db.commit()
    db.refresh(choice)
    return choice


@router.patch("/choices/{choice_id}", response_model=ChoiceRead, summary="Изменить вариант выбора")
def update_choice(choice_id: int, data: ChoiceUpdate, db: SessionDep, _auth: AdminDep):
    choice = get_choice_or_404(db, choice_id)
    changes = data.model_dump(exclude_unset=True)
    if "text" in changes and changes["text"] is None:
        changes["text"] = ""
    if "conditions" in changes and changes["conditions"] is None:
        changes["conditions"] = []
    if "actions" in changes and changes["actions"] is None:
        changes["actions"] = {}
    if changes.get("target_scene_id") is not None:
        scene = get_scene_or_404(db, choice.scene_id)
        ensure_scene_in_quest(db, changes["target_scene_id"], scene.quest_id, "Целевая сцена")
    for key, value in changes.items():
        setattr(choice, key, value)
    db.add(choice)
    db.commit()
    db.refresh(choice)
    return choice


@router.delete("/choices/{choice_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить вариант выбора")
def delete_choice(choice_id: int, db: SessionDep, _auth: AdminDep):
    choice = get_choice_or_404(db, choice_id)
    db.delete(choice)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
