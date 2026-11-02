# ⚒️ Quest Forge

[![Python](https://img.shields.io/badge/Python-3.14-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![SQLModel](https://img.shields.io/badge/SQLModel-SQLite%20%28WAL%29-003B57?logo=sqlite&logoColor=white)](https://sqlmodel.tiangolo.com/)
[![Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla%20ES%20Modules-F7DF1E?logo=javascript&logoColor=black)](#architecture)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](#option-3-run-with-docker-compose)

[Читать на русском](README_RU.md)

**Quest Forge** is a full-stack visual interactive story engine and node-based quest constructor (inspired by [Twine](https://twinery.org)) for authoring, validating, and playing non-linear text RPGs and branching narratives. Design complex story graphs on an interactive 2D node canvas with stateful variables, inventory items, and conditional transitions; play them directly in the browser, or compile any quest into a single self-contained `.html` file ready for zero-backend deployment on itch.io or GitHub Pages.

---

## ✨ Overview & Core Features

### 1. Visual Node Editor & 2D Story Canvas (Node Canvas)
- **Interactive SVG + DOM Canvas**: Renders scenes as interactive cards connected via smooth directional SVG cubic Bézier curves.
- **BFS Auto-Layout**: Breadth-first graph traversal automatically arranges scenes into clean hierarchical tiers and columns starting from the entry node.
- **Drag & Drop + Pan & Zoom**: Freeform node positioning with reactive edge re-rendering and debounced auto-save (including unsaved-changes guards before tab close or export).

### 2. Stateful Story Engine & Interactive Player
- **Twine-like State Logic**: Supports initial quest variables (`{"budget": 150, "morale": 80}`), arithmetic modifiers (`add`), direct assignments (`set`), and inventory mutations (`give_item` / `take_item`).
- **Conditional Transitions**: Evaluates item requirements and variable comparisons (`==`, `!=`, `>`, `>=`, `<`, `<=`) dynamically, automatically generating human-readable lock reasons for unavailable choices.
- **Live String Interpolation**: Substitutes runtime variable values into scene titles, narrative body text, and choice labels on the fly (`{gold}`, `{morale}`).
- **Snapshot Stack & Undo**: Captures session state before every transition (up to 30 steps server-side and 50 steps in standalone builds), allowing players to roll back decisions (`↶ Undo` or `Z` key) along with the playthrough log.
- **Polished Player UX**: Includes 3 instant-switch visual themes (`🌌 Night`, `📜 Parchment`, `⚡ Cyber`), a DOM-safe `TreeWalker` typewriter effect respecting `prefers-reduced-motion`, and built-in demo quests out of the box.

### 3. Static Graph & Logic Validator (`analysis.py`)
- Real-time static analyzer that inspects quest topology and state dependencies for game design errors:
  - **Unreachable scenes** detected via BFS reachability analysis from the start node;
  - **Dead-end scenes** (non-ending nodes with no outgoing choices);
  - **Unobtainable item conditions** (choices requiring items that are never granted or only granted in terminal scenes);
  - **Undeclared `{var}` placeholders** referenced in scene texts or choice labels.

### 4. Standalone HTML Compiler (`export.py`)
- Compiles any quest into a **Single-File Standalone HTML** bundle containing inlined CSS themes, the serialized quest graph, and a lightweight Vanilla JS runtime engine.
- Runs completely offline via double-click (`file://`), persists save states in `localStorage`, and can be uploaded directly to **itch.io** or **GitHub Pages**.

### 5. Optional Role-Based Access Control
- Open by default for frictionless local authoring. Setting `TEXT_QUEST_ADMIN_PASSWORD` protects all mutating endpoints (`POST`, `PATCH`, `DELETE`) and the visual builder via HMAC-SHA256 `HttpOnly` session cookies, HTTP Basic Auth, or `X-Admin-Password` headers while keeping the catalog and player publicly accessible.

---

## 🛠 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Backend** | Python 3.11+ (3.14 supported), FastAPI, Pydantic v2, Uvicorn |
| **Database & ORM** | SQLite 3 (`WAL` journal mode, `foreign_keys=ON`), SQLModel + SQLAlchemy 2.0 |
| **Frontend** | Vanilla JavaScript (native ES Modules, zero build step / zero heavy frameworks), SVG + CSS3 Grid/Flexbox, HTML5 `<dialog>` & `<audio>` |
| **Security** | HMAC-SHA256 session tokens (`HttpOnly`), `secrets.compare_digest` (timing-attack safe), HTTP Basic Auth, in-memory IP rate limiting, XSS-safe custom Markdown parser |
| **Tooling & Infra** | `uv` (`pyproject.toml`, `uv.lock`), Docker & Docker Compose (with `HEALTHCHECK`), integration test suite (`unittest` + `fastapi.testclient`) |

---

## 🏗 Architecture

```text
quest-forge/
├── Dockerfile                  # Production container image (python:3.12-slim) with HEALTHCHECK
├── docker-compose.yml          # Container orchestration & persistent SQLite volume
├── .env.example                # Environment configuration template
├── pyproject.toml              # Package metadata & dependencies (PEP 621 / uv)
├── main.py                     # Application entrypoint (python main.py / uvicorn main:app)
├── LICENSE                     # MIT License
├── tests/
│   ├── test_game.py            # Integration tests: engine loop, BFS validator, Undo, HTML/JSON export
│   └── test_auth.py            # Security tests: Cookie, HTTP Basic, and Header authentication
└── src/text_quest/
    ├── __init__.py             # Package entry & CLI runner
    ├── app.py                  # FastAPI lifespan, rate-limiting middleware, and page routing
    ├── auth.py                 # Author authentication (HMAC tokens, HTTP Basic, X-Admin-Password)
    ├── db.py                   # SQLite connection setup (WAL, FK) & idempotent auto-migrations
    ├── models.py               # SQLModel entities: Quest, Scene, Choice, GameSession
    ├── schemas.py              # Strict Pydantic v2 request/response schemas
    ├── analysis.py             # Static graph & variable/item integrity analyzer (BFS)
    ├── export.py               # Standalone single-file HTML compiler & JSON exporter
    ├── seed.py                 # 2 built-in non-linear demo quests (12 and 23 scenes)
    ├── api/
    │   ├── quests.py           # Builder REST API: quest/scene/choice CRUD, duplication, import/export
    │   └── game.py             # Player REST API: session start, action evaluation, Undo stack
    └── web/
        ├── pages/              # HTML views: catalog (index.html), player (play.html), builder (builder.html)
        └── static/
            ├── css/style.css   # Responsive layout, animations, and Night/Parchment/Cyber themes
            └── js/             # Modular ES frontend: api.js, catalog.js, player.js, builder.js
```

---

## 🚀 Quickstart

### Prerequisites
- **Python 3.11+** (recommended: [`uv`](https://docs.astral.sh/uv/) package manager, or standard `venv` + `pip`)
- **Docker & Docker Compose** *(optional, for containerized deployment)*

### Option 1: Run with `uv` (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/vagram-karapetyan/quest-forge.git
cd quest-forge

# 2. Create environment config from template (optional)
cp .env.example .env

# 3. Sync dependencies and run the server
uv sync
uv run python main.py
```

### Option 2: Run with `venv` and `pip`

```bash
# 1. Create and activate a virtual environment
python -m venv .venv
# Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# Linux / macOS:
source .venv/bin/activate

# 2. Install dependencies
pip install "fastapi>=0.115.0" "uvicorn>=0.30.0" "sqlmodel>=0.0.22" "httpx>=0.27.0"

# 3. Start the application
python main.py
```

### Option 3: Run with Docker Compose

```bash
# Build and start the container in detached mode (SQLite DB persists in ./data)
docker compose up -d --build
```

Once started, access the application at:
- 🌐 **Web UI (Catalog, Player, Node Builder)**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- 📖 **Interactive OpenAPI Docs (Swagger UI)**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- 🩺 **Service Healthcheck**: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

---

## ⚙️ Environment Variables (`.env`)

All configuration options provide sensible defaults and can be overridden via environment variables (see [`.env.example`](.env.example)):

| Variable | Default | Description |
| :--- | :--- | :--- |
| `TEXT_QUEST_HOST` | `127.0.0.1` | Bind address (`0.0.0.0` inside Docker) |
| `TEXT_QUEST_PORT` | `8000` | HTTP server port |
| `TEXT_QUEST_RELOAD` | `0` | Enable hot-reload on code changes (`1` to enable) |
| `TEXT_QUEST_DB` | `data/text_quest.db` | Path to the SQLite database file |
| `TEXT_QUEST_ADMIN_USER` | `admin` | Administrator / author username |
| `TEXT_QUEST_ADMIN_PASSWORD` | *(empty)* | Password protecting builder & write endpoints (open mode if empty) |
| `TEXT_QUEST_RATE_LIMIT_PER_MIN` | `240` | Max `/api/*` requests per minute per client IP |

---

## 🔌 API Endpoints & Usage Examples

### Core REST Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/quests` | List all quests with scene counts and metadata |
| `POST` | `/api/quests` | Create a new quest |
| `GET` | `/api/quests/{id}/full` | Fetch complete quest graph (scenes, choices, coordinates) |
| `GET` | `/api/quests/{id}/validate` | Run static BFS graph & variable/item integrity analysis |
| `GET` | `/api/quests/{id}/export` | Export quest as portable JSON |
| `GET` | `/api/quests/{id}/export/html` | Compile quest into a standalone single-file `.html` game |
| `POST` | `/api/quests/import` | Import a quest from a JSON bundle |
| `POST` | `/api/game/start` | Initialize a new playthrough session |
| `POST` | `/api/game/{session_id}/action` | Execute a player choice, mutate state, and advance scene |
| `POST` | `/api/game/{session_id}/undo` | Roll back the session to the previous snapshot |

### cURL Examples

```bash
# 1. List all available quests
curl -s http://127.0.0.1:8000/api/quests

# 2. Start a new game session for Quest #1
curl -s -X POST http://127.0.0.1:8000/api/game/start \
  -H "Content-Type: application/json" \
  -d '{"quest_id": 1}'

# 3. Make a choice within an active session
curl -s -X POST http://127.0.0.1:8000/api/game/<SESSION_ID>/action \
  -H "Content-Type: application/json" \
  -d '{"choice_id": 2}'

# 4. Undo the last turn
curl -s -X POST http://127.0.0.1:8000/api/game/<SESSION_ID>/undo

# 5. Validate quest graph integrity
curl -s http://127.0.0.1:8000/api/quests/1/validate

# 6. Download compiled standalone HTML bundle
curl -s -OJ http://127.0.0.1:8000/api/quests/1/export/html
```

### Choice Conditions & State Actions Schema
Each choice in the node builder supports declarative JSON conditions and state mutations:

```json
// Choice availability conditions (Choice.conditions):
[
  { "var": "budget", "op": ">=", "value": 40 },
  { "item": "Game Design Document (GDD)", "has": true }
]

// State mutations executed on selection (Choice.actions):
{
  "add": { "budget": -40, "quality": 35 },
  "set": { "artist_hired": true },
  "give_item": "Pixel Art Assets"
}
```

---

## 🧪 Testing

The project includes a comprehensive integration test suite covering the full game loop, variable arithmetic, conditional locks, `Undo` snapshots, quest/scene duplication, BFS graph validation, standalone HTML/JSON export, and authentication flows:

```bash
uv run python -m unittest discover -s tests -v
```

---

## 📄 License

Distributed under the [MIT License](LICENSE).
