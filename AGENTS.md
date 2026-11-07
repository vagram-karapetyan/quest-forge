# AGENTS.md — Quest Forge Developer & Agent Guide

> Руководство для AI-агентов (Claude Code, Cursor, Windsurf, Antigravity) и разработчиков по архитектуре, стандартам разработки и инженерным регламентам проекта Quest Forge.

---

## 🔭 Обзор проекта

**Quest Forge** — это полнофункциональная веб-платформа и визуальный 2D-конструктор нелинейных текстовых RPG и интерактивных историй.
Проект включает в себя:
1. **Визуальный конструктор (Builder)** на базе 2D-графа сцен (SVG + DOM) с авто-расстановкой узлов (BFS), Pan & Zoom и Drag & Drop.
2. **Игровой движок (Engine)** с поддержкой переменных, арифметических модификаторов (`add`), присваиваний (`set`), инвентаря (`give_item`, `take_item`), условий (`==`, `!=`, `>`, `>=`, `<`, `<=`) и стека Undo (откат ходов).
3. **Статический анализатор целостности графа (`analysis.py`)**, проверяющий недостижимые сцены, тупики, невыполнимые условия и необъявленные переменные `{var}`.
4. **Компилятор в Standalone HTML (`export.py`)**, собирающий квест в единый автономный HTML-файл со встроенными стилями, JSON-структурой и легковесным JS-рантаймом для публикации на itch.io и GitHub Pages без сервера.

---

## 🛠 Технологический стек

- **Backend**: Python 3.11+ (проверено на 3.12 / 3.14), FastAPI 0.115+, Pydantic v2, SQLModel 0.0.22+ (SQLAlchemy 2.0), Uvicorn.
- **База данных**: SQLite 3 с обязательным включением `PRAGMA foreign_keys=ON` и `PRAGMA journal_mode=WAL`.
- **Frontend**: Чистый нативный JavaScript (ES Modules, без сборщиков вроде Vite/Webpack/Babel, 0 зависимостей в браузере), нативный SVG для связей Безье, HTML5 `<dialog>` и `<audio>`, CSS3 Grid/Flexbox с поддержкой тем (`night`, `parchment`, `cyber`) и двуязычной локализацией (`EN` / `RU`).
- **Инфраструктура**: `uv` (пакетный менеджер, `pyproject.toml`, `uv.lock`), Docker (`python:3.12-slim` с `HEALTHCHECK`), Docker Compose.
- **Тестирование**: `unittest` + `fastapi.testclient.TestClient`.

---

## 📂 Карта репозитория

```text
quest-forge/
├── AGENTS.md                   # Настоящее руководство для агентов
├── pyproject.toml / uv.lock    # Зависимости и метаданные проекта (uv)
├── Dockerfile                  # Продакшен-образ контейнера с healthcheck
├── docker-compose.yml          # Запуск сервиса с монтированием тома ./data
├── .env.example                # Переменные окружения по умолчанию
├── main.py                     # Совместимая точка входа (uvicorn main:app / python main.py)
├── tests/
│   ├── test_game.py            # Интеграционные тесты движка, валидатора, Undo, экспорта/импорта
│   └── test_auth.py            # Тесты опциональной авторизации (Cookie, Basic, Header)
└── src/text_quest/
    ├── __init__.py             # Консольная точка входа text-quest CLI
    ├── app.py                  # Инициализация FastAPI, middleware (rate limiting, no-cache), lifespan
    ├── auth.py                 # Опциональная HMAC-SHA256 авторизация администратора
    ├── db.py                   # Подключение SQLite (WAL, FK ON), автомиграции колонок, SessionDep
    ├── models.py               # SQLModel-таблицы: Quest, Scene, Choice, GameSession
    ├── schemas.py              # Pydantic v2 схемы валидации, импорта/экспорта и состояния игры
    ├── analysis.py             # Статический анализатор сюжета, предметов и связей графа
    ├── export.py               # Генератор Standalone Single-File HTML и JSON-экспорт
    ├── seed.py                 # Стартовые демо-квесты («Обсерватория» и «Инди-разработчик»)
    ├── api/
    │   ├── quests.py           # REST API: CRUD квестов, сцен, выборов, дублирование, импорт
    │   └── game.py             # REST API: игровой цикл, проверка условий, действия, Undo
    └── web/
        ├── pages/              # HTML-шаблоны: index.html, play.html, builder.html
        └── static/
            ├── css/style.css   # Адаптивные CSS3 стили, анимации и цветовые темы
            └── js/             # ES-модули: api.js, catalog.js, player.js, builder.js
```

---

## 📋 Инженерные регламенты и правила для агентов

При внесении любых изменений агенты обязаны следовать строгим протоколам:

### 1. Архитектурный паритет движков (Критично!)
В проекте сосуществуют два рантайма логики квеста:
- **Серверный движок**: [`src/text_quest/api/game.py`](src/text_quest/api/game.py) (Python).
- **Автономный клиентский движок**: [`src/text_quest/export.py`](src/text_quest/export.py) (JavaScript внутри HTML-шаблона).

> [!IMPORTANT]
> При изменении логики условий (`conditions`), действий (`actions`), модификаций переменных (`add`, `set`), инвентаря (`give_item`, `take_item`) или отката (`undo`) изменения **ОБЯЗАНЫ** синхронно вноситься в оба файла: и в `game.py`, и в `export.py`.

### 2. Целостность базы данных и миграции
- В SQLite внешние ключи **всегда** включены (`PRAGMA foreign_keys=ON`). Каскадные удаления (`CASCADE`) и обнуление ссылок (`SET NULL`) настраиваются на уровне схемы (`ondelete="..."`).
- Модели используют фабричные функции для значений по умолчанию в SQLAlchemy: `default_factory=dict`, `default_factory=list`, `sa_column=Column(JSON, default=dict)`. Мутабельные литералы `{}` и `[]` в `Column(default=...)` запрещены.
- При добавлении новых полей в таблицы добавляйте соответствующие `ALTER TABLE` проверки в функцию `migrate_db()` в [`src/text_quest/db.py`](src/text_quest/db.py).

### 3. Фронтенд без тяжелых сборщиков (Zero-Build Vanilla Stack)
- Запрещено добавлять npm-зависимости, Webpack, Vite, Babel или тяжелые UI-фреймворки в директорию фронтенда. Фронтенд должен оставаться легковесным и работать напрямую через нативные ES-модули браузера.
- Все строки интерфейса должны поддерживать мультиязычность `EN` / `RU` через словарь `I18N` в [`web/static/js/api.js`](src/text_quest/web/static/js/api.js).
- Поддерживайте эффект печатной машинки через `TreeWalker` с обязательным учетом `prefers-reduced-motion`.
- Очистка ввода от XSS в кастомном Markdown-парсере обязательна (`escapeHtml`, `safeUrl`).

### 4. Безопасность
- Проверка паролей и токенов осуществляется исключительно через `secrets.compare_digest` для исключения timing-атак.
- Куки сессии автора выставляются с флагами `HttpOnly=True` и `SameSite="lax"`.
- Rate Limiter в `app.py` должен содержать очистку устаревших IP-адресов и учитывать прокси-заголовок `X-Forwarded-For`.
- Конструктор и мутирующие операции закрываются авторизацией только если задана переменная `TEXT_QUEST_ADMIN_PASSWORD`. Если переменная пуста, конструктор открыт для быстрого локального запуска.

### 5. Ограничения окружения
- Запрещено запускать несогласованные фоновые демоны или серверы без явной команды пользователя.
- Запрещено перезаписывать или удалять пользовательские базы данных в `./data`.

---

## 🧪 Команды разработки и верификации

### Установка зависимостей
```bash
uv sync
# или через pip:
pip install -e .
```

### Запуск тестов (Обязателен перед любым коммитом!)
```bash
uv run python -m unittest discover -s tests -v
```

### Запуск локального сервера разработки
```bash
uv run python main.py
# или с авто-перезагрузкой:
TEXT_QUEST_RELOAD=1 uv run python main.py
```

### Сборка и запуск в Docker
```bash
docker compose up -d --build
```

### Проверка синтаксиса и компиляции
```bash
uv run python -m py_compile (Get-ChildItem -Recurse -Filter *.py src, tests, main.py).FullName
```

---

## 🏷 Формат коммитов

Используйте формат **Conventional Commits**:
- `feat(scope): ...` — новый функционал;
- `fix(scope): ...` — исправление дефектов и багов;
- `refactor(scope): ...` — улучшение структуры кода без изменения поведения;
- `docs(scope): ...` — обновление документации;
- `test(scope): ...` — добавление или обновление тестов.
