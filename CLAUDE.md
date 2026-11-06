# CLAUDE.md — Quest Forge Project Guidelines (ECC Methodology)

> Инструкции и контекст проекта **Quest Forge** для Claude Code и AI-агентов в соответствии с методологией **Everything Claude Code (ECC)**.

---

## 🔭 О проекте

**Quest Forge** — визуальный конструктор нелинейных текстовых RPG и веб-движок интерактивных историй с 2D-графом сцен, системой переменных, условиями, инвентарём и стеком Undo. Квесты могут запускаться на сервере или компилироваться в полностью автономный single-file HTML для itch.io и GitHub Pages.

---

## 🛠 Технологический стек

- **Backend**: Python 3.11+, FastAPI 0.115+, Pydantic v2, SQLModel 0.0.22+ (SQLAlchemy 2.0), Uvicorn.
- **База данных**: SQLite 3 (режимы `WAL`, `foreign_keys=ON`).
- **Frontend**: Zero-Build Vanilla JavaScript (нативные ES-модули, 0 npm-зависимостей в браузере), нативный SVG для кривых Безье, HTML5 `<dialog>` и `<audio>`, CSS3 с поддержкой 3 тем (`night`, `parchment`, `cyber`) и двуязычной локализацией (`EN`/`RU`).
- **Инфраструктура**: `uv` (PEP 621), Docker (python:3.12-slim с `HEALTHCHECK`), Docker Compose.
- **Тестирование**: `unittest` + `fastapi.testclient.TestClient`.

---

## ⚡ Быстрые команды

```bash
# Установка окружения (uv)
uv sync

# Запуск локального сервера разработки
uv run python main.py
# С автоперезагрузкой при изменении файлов:
TEXT_QUEST_RELOAD=1 uv run python main.py

# Запуск тестов (обязателен перед коммитом)
uv run python -m unittest discover -s tests -v

# Синтаксическая проверка и компиляция всех файлов Python
uv run python -m py_compile main.py $(Get-ChildItem -Recurse -Filter *.py src, tests).FullName

# Сборка и запуск в Docker
docker compose up -d --build
```

---

## 📐 Архитектура и структура модулей

```text
quest-forge/
├── CLAUDE.md                   # Настоящие инструкции для Claude Code (ECC)
├── AGENTS.md                   # Руководство для мультиагентных систем
├── pyproject.toml / uv.lock    # Зависимости и метаданные проекта (uv)
├── Dockerfile                  # Контейнер python:3.12-slim с healthcheck
├── docker-compose.yml          # Оркестрация контейнера и volume ./data
├── main.py                     # Точка входа сервера (uvicorn main:app)
├── tests/
│   ├── test_game.py            # Интеграционные тесты движка, валидатора, Undo, импорта/экспорта
│   └── test_auth.py            # Тесты опциональной аутентификации (Cookie, Basic, Header)
└── src/text_quest/
    ├── app.py                  # FastAPI app, lifespan, rate limiting, no-cache, маршрутизация HTML
    ├── auth.py                 # Аутентификация администратора (HMAC-SHA256, HttpOnly Cookie)
    ├── db.py                   # Подключение SQLite (WAL, FK ON), SessionDep, автомиграции
    ├── models.py               # SQLModel-таблицы: Quest, Scene, Choice, GameSession
    ├── schemas.py              # Pydantic v2 схемы API, валидации и импорта/экспорта
    ├── analysis.py             # Статический анализатор сюжета, предметов и связей графа
    ├── export.py               # Генератор автономного Standalone HTML и JSON-экспорт
    ├── seed.py                 # Стартовые демо-квесты («Обсерватория» и «Инди-разработчик»)
    ├── api/
    │   ├── quests.py           # REST API конструктора: CRUD квестов, сцен, выборов, дублирование
    │   └── game.py             # REST API игрового цикла: проверка условий, действия, Undo
    └── web/
        ├── pages/              # HTML: каталог (index), плеер (play), конструктор (builder)
        └── static/
            ├── css/style.css   # Стили, адаптивная верстка, анимации и цветовые темы
            └── js/             # Модули: api.js (i18n, fetch), catalog.js, player.js, builder.js
```

---

## 📋 Стандарты разработки ECC (Everything Claude Code)

### 1. Архитектурный паритет движков (Критично)
В проекте сосуществуют два рантайма логики квеста:
- **Серверный движок**: [`src/text_quest/api/game.py`](src/text_quest/api/game.py) (Python).
- **Автономный клиентский движок**: [`src/text_quest/export.py`](src/text_quest/export.py) (JavaScript внутри HTML).

Любые правки условий (`conditions`), действий (`actions`), модификаций переменных (`add`, `set`), инвентаря (`give_item`, `take_item`) или отката (`undo`) **обязаны синхронно вноситься в оба файла**.

### 2. Целостность базы данных и миграции
- SQLite всегда работает с `PRAGMA foreign_keys=ON` и `PRAGMA journal_mode=WAL`.
- Внешние ключи настраиваются на уровне схемы (`ondelete="CASCADE"`, `ondelete="SET NULL"`).
- Все JSON-колонки в моделях SQLModel используют фабричные вызовы: `default_factory=dict`, `default_factory=list`, `sa_column=Column(JSON, default=dict/list)`. Запрещено передавать мутабельные литералы `{}` и `[]` в `Column(default=...)`.
- При добавлении новых полей в таблицы добавляйте соответствующие `ALTER TABLE` проверки в функцию `migrate_db()` в [`src/text_quest/db.py`](src/text_quest/db.py).

### 3. Frontend & UI/UX стандарты
- **Zero-Build Stack:** Никаких npm/Webpack/Vite/Babel в директории фронтенда. Только чистый нативный ES6+ JavaScript.
- **Интернационализация:** Все пользовательские строки должны поддерживать мультиязычность `EN` / `RU` через словарь `I18N` и `translateServerText()` в [`web/static/js/api.js`](src/text_quest/web/static/js/api.js).
- **Печатная машинка:** Реализована через `TreeWalker` без поломки HTML/Markdown с автоматическим отключением при `prefers-reduced-motion`.
- **Эргономика и доступность:** Минимальный размер кликабельных областей $\ge 44\text{px}$, закрытие диалогов по `Esc` и бэкдропу, ARIA-атрибуты, безопасная очистка Markdown от XSS (`escapeHtml`, `safeUrl`).
- **Автосохранение:** Изменения в конструкторе отправляются с дебаунсом, а при смене сцены обязательно вызывается `await flushPending()`.

### 4. Безопасность
- Проверка паролей и токенов — исключительно через `secrets.compare_digest` для предотвращения timing-атак.
- Куки сессии автора выставляются с флагами `HttpOnly=True` и `SameSite="lax"`.
- Rate Limiter в `app.py` должен содержать очистку устаревших IP-адресов и учитывать заголовок `X-Forwarded-For`.
- Конструктор и мутирующие операции закрываются авторизацией только если задана переменная `TEXT_QUEST_ADMIN_PASSWORD`. Если переменная пуста, конструктор открыт для быстрого локального запуска.

### 5. Сквозной цикл верификации (Verification Loop)
Перед каждым коммитом агент обязан выполнить 5 шагов:
1. **Types / Syntax:** `uv run python -m py_compile` для всех файлов без ошибок.
2. **Tests:** `uv run python -m unittest discover -s tests -v` — 100% прохождение тестов.
3. **Build:** Проверка сборки Dockerfile или Standalone HTML экспорта.
4. **Diff:** Проверка `git diff` на отсутствие лишних файлов, артефактов и мусора.
5. **Git Commit:** Атомарный коммит в формате **Conventional Commits** (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
