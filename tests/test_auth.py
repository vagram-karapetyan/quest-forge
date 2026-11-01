"""Тесты опциональной авторизации администратора."""

import base64
import os
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from text_quest import db
from text_quest.app import app


class TestAuth(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._temp_dir = tempfile.TemporaryDirectory()
        cls._prev_db_env = os.environ.get("TEXT_QUEST_DB")
        test_db_path = Path(cls._temp_dir.name) / "test_auth.db"
        os.environ["TEXT_QUEST_DB"] = str(test_db_path)
        db.configure_db(test_db_path)
        db.init_db()

    @classmethod
    def tearDownClass(cls):
        db.engine.dispose()
        if cls._prev_db_env is None:
            os.environ.pop("TEXT_QUEST_DB", None)
        else:
            os.environ["TEXT_QUEST_DB"] = cls._prev_db_env
        cls._temp_dir.cleanup()

    def setUp(self):
        # Сбрасываем переменные окружения авторизации
        os.environ.pop("TEXT_QUEST_ADMIN_PASSWORD", None)
        os.environ.pop("TEXT_QUEST_ADMIN_USER", None)
        self.client = TestClient(app)

    def tearDown(self):
        os.environ.pop("TEXT_QUEST_ADMIN_PASSWORD", None)
        os.environ.pop("TEXT_QUEST_ADMIN_USER", None)

    def test_auth_disabled_by_default(self):
        """Когда пароль не задан, все запросы разрешены без авторизации."""
        client = self.client

        # Статус
        st = client.get("/api/auth/status").json()
        self.assertFalse(st["auth_required"])
        self.assertTrue(st["is_authenticated"])

        # Создание квеста работает без заголовков
        res = client.post("/api/quests", json={"title": "Открытый квест"})
        self.assertEqual(res.status_code, 201)
        quest_id = res.json()["id"]

        # Страница конструктора доступна
        res_page = client.get(f"/builder/{quest_id}")
        self.assertEqual(res_page.status_code, 200)

    def test_auth_enabled_protection(self):
        """Когда пароль задан, конструктор и мутации защищены."""
        os.environ["TEXT_QUEST_ADMIN_USER"] = "alice"
        os.environ["TEXT_QUEST_ADMIN_PASSWORD"] = "secret42"

        client = TestClient(app)

        # 1. Публичные маршруты доступны всем
        self.assertEqual(client.get("/").status_code, 200)
        self.assertEqual(client.get("/api/quests").status_code, 200)

        # Статус сообщает, что требуется пароль
        st = client.get("/api/auth/status").json()
        self.assertTrue(st["auth_required"])
        self.assertFalse(st["is_authenticated"])

        # 2. Неавторизованный запрос на изменение отвергается (401)
        res_unauth = client.post("/api/quests", json={"title": "Хакерский квест"})
        self.assertEqual(res_unauth.status_code, 401)
        self.assertIn("WWW-Authenticate", res_unauth.headers)

        res_builder = client.get("/builder/1")
        self.assertEqual(res_builder.status_code, 401)

        # 3. Неправильный пароль в форме входа
        res_bad_login = client.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
        self.assertEqual(res_bad_login.status_code, 401)

        # 4. Успешный вход через /api/auth/login
        res_login = client.post("/api/auth/login", json={"username": "alice", "password": "secret42"})
        self.assertEqual(res_login.status_code, 200)
        data = res_login.json()
        self.assertTrue(data["is_authenticated"])
        self.assertEqual(data["username"], "alice")

        # Теперь клиент авторизован через Cookie
        res_create = client.post("/api/quests", json={"title": "Квест от Alice"})
        self.assertEqual(res_create.status_code, 201)
        quest_id = res_create.json()["id"]

        res_page_ok = client.get(f"/builder/{quest_id}")
        self.assertEqual(res_page_ok.status_code, 200)

        # 5. Выход (Logout)
        res_logout = client.post("/api/auth/logout")
        self.assertEqual(res_logout.status_code, 200)

        # Снова 401
        self.assertEqual(client.get(f"/builder/{quest_id}").status_code, 401)

        # 6. Проверка через HTTP Basic Auth
        token = base64.b64encode(b"alice:secret42").decode("ascii")
        basic_headers = {"Authorization": f"Basic {token}"}
        res_basic = client.post("/api/quests", json={"title": "Basic Auth Quest"}, headers=basic_headers)
        self.assertEqual(res_basic.status_code, 201)

        # 7. Проверка через кастомный заголовок X-Admin-Password
        hdr = {"X-Admin-Password": "secret42"}
        res_hdr = client.post("/api/quests", json={"title": "Header Quest"}, headers=hdr)
        self.assertEqual(res_hdr.status_code, 201)


if __name__ == "__main__":
    unittest.main()
