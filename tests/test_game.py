"""Тест полного сценария: БД, сид, API игры, валидатора, переменных и экспорта."""

import os
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from sqlmodel import Session

from text_quest import db
from text_quest.app import app
from text_quest.models import Choice
from text_quest.seed import DEMO_TITLE, INDIE_TITLE, seed_if_empty


class TestGame(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._temp_dir = tempfile.TemporaryDirectory()
        cls._prev_db_env = os.environ.get("TEXT_QUEST_DB")
        test_db_path = Path(cls._temp_dir.name) / "test_text_quest.db"
        os.environ["TEXT_QUEST_DB"] = str(test_db_path)
        db.configure_db(test_db_path)
        db.init_db()
        with Session(db.engine) as s:
            seed_if_empty(s)
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        db.engine.dispose()
        if cls._prev_db_env is None:
            os.environ.pop("TEXT_QUEST_DB", None)
        else:
            os.environ["TEXT_QUEST_DB"] = cls._prev_db_env
        cls._temp_dir.cleanup()

    def test_full_scenario(self):
        client = self.client

        # 1. Проверяем каталог
        res = client.get("/api/quests")
        self.assertEqual(res.status_code, 200, res.text)
        quests = res.json()
        self.assertGreaterEqual(len(quests), 1)
        quest = next(q for q in quests if q["title"] == DEMO_TITLE)
        self.assertGreaterEqual(quest["scene_count"], 10)
        self.assertEqual(quest["win_endings"], 2)
        self.assertEqual(quest["lose_endings"], 1)

        # 2. Валидация
        res = client.get(f"/api/quests/{quest['id']}/validate")
        self.assertEqual(res.status_code, 200)
        report = res.json()
        self.assertTrue(report["ok"])
        self.assertEqual(len(report["issues"]), 0)

        # 3. Прохождение игры: старт -> идем в сад -> сторожка -> берем ключ
        res = client.post("/api/game/start", json={"quest_id": quest["id"]})
        self.assertEqual(res.status_code, 201, res.text)
        state = res.json()
        session_id = state["session_id"]

        def find_choice(choices, text_part):
            for c in choices:
                if text_part.lower() in c["text"].lower():
                    return c
            self.fail(f"Выбор с текстом '{text_part}' не найден среди: {[c['text'] for c in choices]}")

        # Сцена: ворота -> сад ("Обойти здание по заросшей тропинке")
        c = find_choice(state["choices"], "тропинк")
        self.assertTrue(c["available"])
        res = client.post(f"/api/game/{session_id}/action", json={"choice_id": c["id"]})
        self.assertEqual(res.status_code, 200)
        state = res.json()
        self.assertEqual(state["scene"]["title"], "Заросший сад")

        # Сад -> сторожка
        c = find_choice(state["choices"], "сторожк")
        self.assertTrue(c["available"])
        state = client.post(f"/api/game/{session_id}/action", json={"choice_id": c["id"]}).json()
        self.assertEqual(state["scene"]["title"], "Сторожка смотрителя")

        # В сторожке берем ключ
        c = find_choice(state["choices"], "латунный ключ")
        self.assertTrue(c["available"])
        state = client.post(f"/api/game/{session_id}/action", json={"choice_id": c["id"]}).json()
        self.assertIn("Латунный ключ", state["inventory"])

        # Возвращаемся через сад к воротам и идем в главный зал
        c = find_choice(state["choices"], "сад")
        state = client.post(f"/api/game/{session_id}/action", json={"choice_id": c["id"]}).json()
        c = find_choice(state["choices"], "воротам")
        state = client.post(f"/api/game/{session_id}/action", json={"choice_id": c["id"]}).json()
        c = find_choice(state["choices"], "главн")
        state = client.post(f"/api/game/{session_id}/action", json={"choice_id": c["id"]}).json()
        self.assertEqual(state["scene"]["title"], "Главный зал")

        # Библиотека заперта, но ключ у нас есть — выбор должен быть доступен
        c_lib = find_choice(state["choices"], "библиотек")
        self.assertTrue(c_lib["available"], "Дверь должна открыться, так как ключ в инвентаре")
        state = client.post(f"/api/game/{session_id}/action", json={"choice_id": c_lib["id"]}).json()
        self.assertEqual(state["scene"]["title"], "Библиотека астронома")

        # Берем линзу
        c_lens = find_choice(state["choices"], "линзу")
        state = client.post(f"/api/game/{session_id}/action", json={"choice_id": c_lens["id"]}).json()
        self.assertIn("Хрустальная линза", state["inventory"])

        # Возвращаемся в зал -> поднимаемся под купол
        c = find_choice(state["choices"], "главный зал")
        state = client.post(f"/api/game/{session_id}/action", json={"choice_id": c["id"]}).json()
        c = find_choice(state["choices"], "винтовой лестнице")
        state = client.post(f"/api/game/{session_id}/action", json={"choice_id": c["id"]}).json()
        self.assertEqual(state["scene"]["title"], "Купол телескопа")

        # Телескоп: линза есть — выбор доступен
        c_lens_insert = find_choice(state["choices"], "вставить")
        self.assertTrue(c_lens_insert["available"])
        state = client.post(f"/api/game/{session_id}/action", json={"choice_id": c_lens_insert["id"]}).json()
        self.assertEqual(state["scene"]["title"], "Взгляд сквозь линзу")

        # Шагаем в меловой круг -> победа!
        c_win = find_choice(state["choices"], "круг")
        state = client.post(f"/api/game/{session_id}/action", json={"choice_id": c_win["id"]}).json()
        self.assertEqual(state["status"], "win")

        # Проверяем историю сессии
        res = client.get(f"/api/game/{session_id}")
        self.assertEqual(res.status_code, 200)
        session_data = res.json()
        self.assertEqual(session_data["status"], "win")
        self.assertGreater(session_data["steps"], 5)
        self.assertIn("Латунный ключ", session_data["inventory"])
        self.assertIn("Хрустальная линза", session_data["inventory"])

    def test_export_and_import(self):
        client = self.client
        quests = client.get("/api/quests").json()
        qid = next(q["id"] for q in quests if q["title"] == DEMO_TITLE)

        # Экспорт в JSON
        res = client.get(f"/api/quests/{qid}/export/json")
        self.assertEqual(res.status_code, 200)
        self.assertIn("application/json", res.headers["content-type"])
        exported = res.json()
        self.assertIn("title", exported)
        self.assertIn("scenes", exported)
        self.assertGreater(len(exported["scenes"]), 5)

        # Экспорт в автономный HTML
        res_html = client.get(f"/api/quests/{qid}/export/html")
        self.assertEqual(res_html.status_code, 200)
        self.assertIn("text/html", res_html.headers["content-type"])
        html_text = res_html.text
        self.assertIn("<!DOCTYPE html>", html_text)
        self.assertIn("const QUEST =", html_text)
        self.assertIn(exported["title"], html_text)

        # Импорт как нового квеста
        exported["title"] = "Импортированная копия"
        res_import = client.post("/api/quests/import", json=exported)
        self.assertEqual(res_import.status_code, 201)
        new_quest = res_import.json()
        self.assertEqual(new_quest["title"], "Импортированная копия")
        self.assertNotEqual(new_quest["id"], qid)

        # Проверяем, что копия появилась в каталоге
        all_quests = client.get("/api/quests").json()
        self.assertTrue(any(q["id"] == new_quest["id"] for q in all_quests))

    def test_variables_and_conditions(self):
        client = self.client

        # Создаем квест с начальными переменными
        q = client.post("/api/quests", json={
            "title": "Квест с золотом",
            "description": "Тест числовых переменных и условий",
            "initial_variables": {"gold": 50, "hp": 100},
        }).json()

        # Создаем 2 сцены
        s1_id = q["start_scene_id"]
        s2 = client.post(f"/api/quests/{q['id']}/scenes", json={
            "title": "Сокровищница ({gold} зол.)",
            "text": "У вас {gold} золота и {hp} жизней. Неизвестная: {unknown_var}.",
            "ending": "win",
        }).json()
        vault_id = s2["id"]

        # Выбор 1: дает предмет "Пропуск" через actions.give_item и остается в s1_id
        client.post(f"/api/scenes/{s1_id}/choices", json={
            "text": "Взять пропуск",
            "target_scene_id": s1_id,
            "actions": {"give_item": "Пропуск"},
        })

        # Выбор 2: требует gold >= 20 и наличие пропуска, списывает 20 золота и дает 10 hp
        c2 = client.post(f"/api/scenes/{s1_id}/choices", json={
            "text": "Войти в сокровищницу (баланс {gold} золота, нужен Пропуск)",
            "target_scene_id": vault_id,
            "conditions": [
                {"type": "var", "var": "gold", "op": ">=", "value": 20},
                {"type": "item", "item": "Пропуск", "has": True},
            ],
            "actions": {"add": {"gold": -20, "hp": 10}},
        }).json()

        # Проверяем анализатор: предмет "Пропуск" выдан через actions.give_item -> ошибок быть не должно,
        # но должно быть предупреждение о {unknown_var}
        val_report = client.get(f"/api/quests/{q['id']}/validate").json()
        self.assertTrue(val_report["ok"], val_report["issues"])
        self.assertIn("Пропуск", val_report["items"])
        self.assertTrue(any("unknown_var" in i["message"] for i in val_report["issues"]))

        # Стартуем игру
        g = client.post("/api/game/start", json={"quest_id": q["id"]}).json()
        self.assertEqual(g["variables"]["gold"], 50)
        self.assertEqual(g["variables"]["hp"], 100)
        # Проверяем подстановку переменной в тексте выбора
        c_vault_view = next(c for c in g["choices"] if c["id"] == c2["id"])
        self.assertIn("баланс 50 золота", c_vault_view["text"])

        # Берем пропуск
        c_pass = next(c for c in g["choices"] if "пропуск" in c["text"].lower())
        g = client.post(f"/api/game/{g['session_id']}/action", json={"choice_id": c_pass["id"]}).json()
        self.assertIn("Пропуск", g["inventory"])
        # Повторное взятие пропуска должно скрыться, так как предмет уже в инвентаре
        self.assertFalse(any(c["id"] == c_pass["id"] for c in g["choices"]))

        # Делаем выбор 2
        g = client.post(f"/api/game/{g['session_id']}/action", json={"choice_id": c2["id"]}).json()
        self.assertEqual(g["variables"]["gold"], 30)
        self.assertEqual(g["variables"]["hp"], 110)
        self.assertIn("У вас 30 золота и 110 жизней.", g["scene"]["text"])
        self.assertEqual(g["scene"]["title"], "Сокровищница (30 зол.)")

    def test_indie_dev_quest(self):
        client = self.client

        # 1. Находим квест инди-разработчика
        res = client.get("/api/quests")
        self.assertEqual(res.status_code, 200)
        indie_quest = None
        for q in res.json():
            if q["title"] == INDIE_TITLE:
                indie_quest = q
                break
        self.assertIsNotNone(indie_quest, "Инди-квест должен быть в базе данных")
        self.assertGreaterEqual(indie_quest["scene_count"], 20)
        self.assertEqual(indie_quest["win_endings"], 3)
        self.assertEqual(indie_quest["lose_endings"], 3)
        self.assertTrue(indie_quest["playable"])

        # 2. Проверяем валидатором целостности
        val_res = client.get(f"/api/quests/{indie_quest['id']}/validate")
        self.assertEqual(val_res.status_code, 200)
        report = val_res.json()
        self.assertTrue(report["ok"])
        self.assertEqual(len([i for i in report["issues"] if i["level"] == "error"]), 0)

        # 3. Стартуем прохождение
        g = client.post("/api/game/start", json={"quest_id": indie_quest["id"]}).json()
        self.assertEqual(g["status"], "playing")
        self.assertEqual(g["variables"]["budget"], 150)
        self.assertEqual(g["variables"]["morale"], 80)

        # Идем пить кофе с Пашей
        choice_pasha = next(c for c in g["choices"] if "пашей" in c["text"].lower())
        g = client.post(f"/api/game/{g['session_id']}/action", json={"choice_id": choice_pasha["id"]}).json()
        self.assertIn("Паш", g["scene"]["title"])

        # Берем энергетик
        choice_energy = next(c for c in g["choices"] if "энергетик" in c["text"].lower())
        g = client.post(f"/api/game/{g['session_id']}/action", json={"choice_id": choice_energy["id"]}).json()
        self.assertIn("Энергетик «GameDev Fuel»", g["inventory"])
        self.assertEqual(g["variables"]["morale"], 90)

    def test_delete_quest_and_no_cache_headers(self):
        client = self.client

        # 1. Проверяем наличие заголовков отключения кэша
        res = client.get("/api/quests")
        self.assertEqual(res.status_code, 200)
        self.assertIn("no-store", res.headers.get("cache-control", ""))

        # 2. Создаем квест для удаления
        created = client.post("/api/quests", json={"title": "Квест под снос"}).json()
        qid = created["id"]

        # Создаем сцену и выбор
        s2 = client.post(f"/api/quests/{qid}/scenes", json={"title": "Сцена 2", "text": "2"}).json()
        client.post(f"/api/scenes/{created['start_scene_id']}/choices", json={
            "text": "Перейти",
            "target_scene_id": s2["id"],
        })

        # Создаем сессию игры
        client.post("/api/game/start", json={"quest_id": qid})

        # Проверяем, что квест появился в списке
        all_ids = [q["id"] for q in client.get("/api/quests").json()]
        self.assertIn(qid, all_ids)

        # 3. Удаляем квест
        del_res = client.delete(f"/api/quests/{qid}")
        self.assertEqual(del_res.status_code, 204)

        # 4. Проверяем, что квест мгновенно пропал из списка
        updated_ids = [q["id"] for q in client.get("/api/quests").json()]
        self.assertNotIn(qid, updated_ids)

        # И попытка получить его возвращает 404
        self.assertEqual(client.get(f"/api/quests/{qid}").status_code, 404)


    def test_undo_and_log(self):
        client = self.client
        quests = client.get("/api/quests").json()
        quest = next(q for q in quests if q["title"] == DEMO_TITLE)

        # 1. Стартуем новую игру
        res = client.post("/api/game/start", json={"quest_id": quest["id"]})
        self.assertEqual(res.status_code, 201)
        state = res.json()
        session_id = state["session_id"]
        self.assertFalse(state["can_undo"])
        self.assertEqual(len(state["log"]), 0)
        start_scene_id = state["scene"]["id"]

        # Попытка отката, когда ходов нет -> 400 Bad Request
        undo_err = client.post(f"/api/game/{session_id}/undo")
        self.assertEqual(undo_err.status_code, 400)

        # 2. Делаем первый ход (в сад)
        choice_garden = next(c for c in state["choices"] if "тропинк" in c["text"].lower())
        res = client.post(f"/api/game/{session_id}/action", json={"choice_id": choice_garden["id"]})
        self.assertEqual(res.status_code, 200)
        state = res.json()
        self.assertTrue(state["can_undo"])
        self.assertEqual(state["steps"], 1)
        self.assertEqual(len(state["log"]), 1)
        self.assertEqual(state["log"][0]["scene_id"], start_scene_id)
        self.assertEqual(state["scene"]["title"], "Заросший сад")
        garden_scene_id = state["scene"]["id"]

        # 3. Делаем второй ход (в сторожку)
        choice_guard = next(c for c in state["choices"] if "сторожк" in c["text"].lower())
        res = client.post(f"/api/game/{session_id}/action", json={"choice_id": choice_guard["id"]})
        self.assertEqual(res.status_code, 200)
        state = res.json()
        self.assertEqual(state["steps"], 2)
        self.assertEqual(len(state["log"]), 2)
        self.assertEqual(state["scene"]["title"], "Сторожка смотрителя")

        # 4. Откатываемся на один ход назад (должны оказаться в саду)
        res = client.post(f"/api/game/{session_id}/undo")
        self.assertEqual(res.status_code, 200)
        state = res.json()
        self.assertEqual(state["scene"]["id"], garden_scene_id)
        self.assertEqual(state["scene"]["title"], "Заросший сад")
        self.assertEqual(state["steps"], 1)
        self.assertEqual(len(state["log"]), 1)
        self.assertTrue(state["can_undo"])

        # 5. Откатываемся к началу квеста
        res = client.post(f"/api/game/{session_id}/undo")
        self.assertEqual(res.status_code, 200)
        state = res.json()
        self.assertEqual(state["scene"]["id"], start_scene_id)
        self.assertEqual(state["steps"], 0)
        self.assertEqual(len(state["log"]), 0)
        self.assertFalse(state["can_undo"])

    def test_duplicate_quest_and_scene(self):
        client = self.client
        quests = client.get("/api/quests").json()
        orig_quest = next(q for q in quests if q["title"] == DEMO_TITLE)
        orig_id = orig_quest["id"]

        # 1. Дублируем квест
        dup_res = client.post(f"/api/quests/{orig_id}/duplicate")
        self.assertEqual(dup_res.status_code, 201)
        dup = dup_res.json()
        dup_id = dup["id"]
        self.assertNotEqual(dup_id, orig_id)
        self.assertIn("(Копия)", dup["title"])

        # Получаем структуру копии и проверяем, что все сцены принадлежат новому квесту
        dup_detail = client.get(f"/api/quests/{dup_id}").json()
        self.assertEqual(len(dup_detail["scenes"]), orig_quest["scene_count"])
        scene_ids = {s["id"] for s in dup_detail["scenes"]}
        self.assertNotIn(orig_quest["start_scene_id"], scene_ids)
        self.assertIn(dup_detail["start_scene_id"], scene_ids)

        # Проверяем, что связи target_scene_id перенаправлены на новые сцены
        for s in dup_detail["scenes"]:
            for c in s["choices"]:
                if c["target_scene_id"] is not None:
                    self.assertIn(c["target_scene_id"], scene_ids, "Связь выбора должна указывать на сцену копии")

        # 2. Дублируем сцену внутри квеста
        start_scene = dup_detail["scenes"][0]
        dup_scene_res = client.post(f"/api/scenes/{start_scene['id']}/duplicate")
        self.assertEqual(dup_scene_res.status_code, 201)
        dup_scene = dup_scene_res.json()
        self.assertNotEqual(dup_scene["id"], start_scene["id"])
        self.assertIn("(Копия)", dup_scene["title"])
        self.assertEqual(dup_scene["quest_id"], dup_id)
        self.assertEqual(len(dup_scene["choices"]), len(start_scene["choices"]))

        # Удаляем дубликат квеста в конце теста
        del_res = client.delete(f"/api/quests/{dup_id}")
        self.assertEqual(del_res.status_code, 204)

    def test_healthcheck_endpoint(self):
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data.get("status"), "ok")
        self.assertIn("version", data)

    def test_boolean_unset_conditions_and_multi_items(self):
        """Тест логики булевых переменных (unset -> False) и поддержки списков предметов."""
        client = self.client
        # Создаем квест
        q = client.post("/api/quests", json={"title": "Квест булевых условий"}).json()
        qid = q["id"]
        start_id = q["start_scene_id"]

        # Добавляем сцену 2
        s2 = client.post(f"/api/quests/{qid}/scenes", json={"title": "Сцена 2", "text": "Текст 2"}).json()
        s2_id = s2["id"]

        # Выбор 1: доступен только если unset_flag == False (переменная unset_flag еще не создана)
        c1 = client.post(f"/api/scenes/{start_id}/choices", json={
            "text": "Идти дальше если флаг ложен",
            "target_scene_id": s2_id,
            "conditions": [{"var": "unset_flag", "op": "==", "value": False}],
            "actions": {
                "give_item": ["Меч", "Щит"],
                "set": {"unset_flag": True},
            },
        }).json()

        # Выбор 2: требует unset_flag == True (сейчас заблокирован)
        client.post(f"/api/scenes/{start_id}/choices", json={
            "text": "Идти дальше если флаг истинен",
            "target_scene_id": s2_id,
            "conditions": [{"var": "unset_flag", "op": "==", "value": True}],
        }).json()

        # Старт игры
        res_start = client.post("/api/game/start", json={"quest_id": qid})
        self.assertEqual(res_start.status_code, 201)
        state = res_start.json()
        sid = state["session_id"]

        # Первый выбор доступен
        c1_view = next(c for c in state["choices"] if c["id"] == c1["id"])
        self.assertTrue(c1_view["available"])

        # Второй выбор заблокирован
        c2_view = next(c for c in state["choices"] if c["id"] != c1["id"])
        self.assertFalse(c2_view["available"])

        # Совершаем выбор 1 -> получаем сразу 2 предмета из списка и unset_flag = True
        res_act = client.post(f"/api/game/{sid}/action", json={"choice_id": c1["id"]})
        self.assertEqual(res_act.status_code, 200)
        state_after = res_act.json()
        self.assertIn("Меч", state_after["inventory"])
        self.assertIn("Щит", state_after["inventory"])
        self.assertTrue(state_after["variables"]["unset_flag"])

        # Отменяем ход (Undo) -> инвентарь и флаги откатываются
        res_undo = client.post(f"/api/game/{sid}/undo")
        self.assertEqual(res_undo.status_code, 200)
        state_undone = res_undo.json()
        self.assertNotIn("Меч", state_undone["inventory"])
        self.assertNotIn("Щит", state_undone["inventory"])
        self.assertNotIn("unset_flag", state_undone["variables"])

        # Очищаем квест
        client.delete(f"/api/quests/{qid}")

    def test_analysis_broken_links_and_unreachable_items(self):
        """Тест статического валидатора на битые ссылки и предметы в недостижимых сценах."""
        client = self.client
        q = client.post("/api/quests", json={"title": "Квест с ошибками геймдизайна"}).json()
        qid = q["id"]
        start_id = q["start_scene_id"]

        # Создаем второй квест со своей сценой
        q_other = client.post("/api/quests", json={"title": "Другой квест"}).json()
        other_scene_id = q_other["start_scene_id"]

        # Недостижимая сцена в основном квесте, где выдается артефакт
        unreachable = client.post(f"/api/quests/{qid}/scenes", json={"title": "Изолированная комната", "text": "Секрет"}).json()
        unreachable_id = unreachable["id"]
        client.post(f"/api/scenes/{unreachable_id}/choices", json={
            "text": "Взять амулет",
            "item_given": "Тайный амулет",
        })

        # В стартовой сцене делаем выбор, требующий этот амулет
        client.post(f"/api/scenes/{start_id}/choices", json={
            "text": "Открыть портал",
            "required_item": "Тайный амулет",
        })

        # И выбор, ссылающийся на сцену из чужого квеста
        with Session(db.engine) as s:
            s.add(Choice(scene_id=start_id, text="Прыгнуть в чужой квест", target_scene_id=other_scene_id))
            s.commit()

        rep = client.get(f"/api/quests/{qid}/validate").json()
        self.assertFalse(rep["ok"])
        messages = [i["message"] for i in rep["issues"]]

        # Проверяем, что валидатор обнаружил чужую/несуществующую в квесте сцену
        self.assertTrue(any(f"несуществующую в этом квесте сцену #{other_scene_id}" in m for m in messages))
        # Проверяем, что валидатор сообщил о выдаче предмета только в недостижимой сцене
        self.assertTrue(any("только в недостижимой сцене" in m for m in messages))

        client.delete(f"/api/quests/{qid}")
        client.delete(f"/api/quests/{q_other['id']}")

    def test_import_quest_with_string_ids(self):
        """Тест импорта структуры квеста со строковыми идентификаторами сцен."""
        client = self.client
        payload = {
            "title": "Импорт со строковыми ID",
            "start_scene_id": "intro",
            "scenes": [
                {
                    "id": "intro",
                    "title": "Интро",
                    "text": "Начало приключения.",
                    "choices": [
                        {"text": "В путь", "target_scene_id": "crossroads"}
                    ]
                },
                {
                    "id": "crossroads",
                    "title": "Перекресток",
                    "text": "Куда пойти?",
                    "ending": "win",
                    "choices": []
                }
            ]
        }
        res = client.post("/api/quests/import", json=payload)
        self.assertEqual(res.status_code, 201)
        imported = res.json()
        qid = imported["id"]

        detail = client.get(f"/api/quests/{qid}").json()
        self.assertEqual(len(detail["scenes"]), 2)
        intro_scene = next(s for s in detail["scenes"] if s["title"] == "Интро")
        crossroads_scene = next(s for s in detail["scenes"] if s["title"] == "Перекресток")

        self.assertEqual(detail["start_scene_id"], intro_scene["id"])
        self.assertEqual(intro_scene["choices"][0]["target_scene_id"], crossroads_scene["id"])

        client.delete(f"/api/quests/{qid}")

    def test_duplicate_scene_self_loop_remap(self):
        """При дублировании сцены выбор, зацикленный на нее саму, должен перенаправляться на новую сцену."""
        client = self.client
        q = client.post("/api/quests", json={"title": "Квест для дублирования сцены"}).json()
        qid = q["id"]
        start_id = q["start_scene_id"]

        # Выбор, ведущий в саму себя (петля)
        client.post(f"/api/scenes/{start_id}/choices", json={
            "text": "Оглядеться еще раз",
            "target_scene_id": start_id,
        })

        dup_res = client.post(f"/api/scenes/{start_id}/duplicate")
        self.assertEqual(dup_res.status_code, 201)
        dup_scene = dup_res.json()

        self.assertNotEqual(dup_scene["id"], start_id)
        # target_scene_id выбора должен указывать на dup_scene["id"], а не на старый start_id
        self.assertEqual(dup_scene["choices"][0]["target_scene_id"], dup_scene["id"])

        client.delete(f"/api/quests/{qid}")

    def test_rate_limiter_proxy_and_pruning(self):
        """Тест извлечения IP из X-Forwarded-For и автоматической очистки словаря."""
        from text_quest.app import _RATE_LIMIT_STORE

        client = self.client
        # Запрос с заголовком X-Forwarded-For
        res = client.get("/api/quests", headers={"X-Forwarded-For": "203.0.113.195, 10.0.0.1"})
        self.assertEqual(res.status_code, 200)
        self.assertIn("203.0.113.195", _RATE_LIMIT_STORE)

        # Тестируем механизм прунинга: наполняем устаревшими записями
        now = 1000.0
        for i in range(505):
            _RATE_LIMIT_STORE[f"fake.ip.{i}"] = [now - 70.0]

        # Следующий запрос должен вызвать очистку записей старше 60 секунд
        client.get("/api/quests", headers={"X-Forwarded-For": "198.51.100.1"})
        # Устаревшие записи fake.ip.* должны быть удалены
        self.assertNotIn("fake.ip.0", _RATE_LIMIT_STORE)
        self.assertLess(len(_RATE_LIMIT_STORE), 500)


if __name__ == "__main__":
    unittest.main()
