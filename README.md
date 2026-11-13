# Quest Forge v2

A unified nonlinear text RPG platform with a shared deterministic TypeScript engine, SQLite-backed Fastify API, visual 2D scene-graph builder, responsive web player, and offline Standalone HTML compiler.

## Architecture

This repository is organized as an npm workspaces monorepo (`0.1.0`):

- `packages/engine` (`@quest-forge/engine`) — Pure TypeScript core shared across server, web, and standalone targets:
  - Zod v2 domain & portable JSON schemas
  - Deterministic game runtime (inventory, typed variables, conditions/effects, float rounding safety, `{var}` interpolation, up to 50 undo steps, structured events)
  - Safe Markdown renderer with URL protocol whitelist
  - Static graph validator, BFS auto-layout, and 2D scene-graph geometry helpers
  - `EN` / `RU` i18n dictionary and shared 3-theme stylesheet (`Night`, `Parchment`, `Cyber`)
  - Self-contained Standalone HTML compiler
- `packages/standalone` (`@quest-forge/standalone`) — Offline HTML player shell bundled via `esbuild` with `localStorage` persistence, hotkeys (`1–9`, `Z`, `Space`/`Enter`), typewriter effect, and theme/locale parity.
- `apps/server` (`@quest-forge/server`) — Fastify + SQLite (`better-sqlite3` + Drizzle ORM with SQL migrations), serving the REST API, `/api/health`, seeded v2 demo quests, author session auth, and built static frontend assets.
- `apps/web` (`@quest-forge/web`) — React + Vite frontend with quest catalog, JSON import/export, Standalone HTML download, online player, and `/builder/:questId` visual 2D scene-graph editor.

## Quick Start (Local)

Requirements: **Node.js >= 22** (tested on Node 24) and npm workspaces. Note that `better-sqlite3` compiles a native addon when prebuilt binaries are unavailable for your platform.

```bash
npm install
npm run dev
```

`npm run dev` runs both the Fastify API server and Vite dev server concurrently (`HOST=127.0.0.1`, `PORT=3000` for API, Vite dev UI proxying `/api`).

To run the production build locally as a single server:

```bash
npm run build
npm start
```

Copy `.env.example` to `.env` if you want to customize environment settings:

- `HOST`, `PORT`, `NODE_ENV`
- `DATABASE_PATH` (default `./data/quest-forge.db`)
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_SESSION_TTL_HOURS` (leave `ADMIN_PASSWORD` empty to allow passwordless local editing)
- `GAME_SESSION_TTL_HOURS`, `SEED_DEMOS`
- `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`, `TRUSTED_PROXIES`

## Docker Deployment

The included `Dockerfile` uses a multi-stage `node:24-slim` (glibc) build so `better-sqlite3` runs cleanly without Alpine musl compatibility issues, keeps SQLite storage in `/app/data`, and wires a `/api/health` check.

```bash
docker compose up -d --build
```

Key deployment settings in `docker-compose.yml`:

- Persistent volume: `quest_forge_data:/app/data` (`DATABASE_PATH=/app/data/quest-forge.db`)
- Exposed port: `${PORT:-3000}:3000`
- Healthcheck: `GET http://127.0.0.1:3000/api/health`
- Set `ADMIN_PASSWORD` in your environment before deploying publicly so builder/import/mutation routes require author login.

## Verification & Scripts

- `npm run format:check` — Check formatting with Prettier (`npm run format` to write)
- `npm run typecheck` — TypeScript typecheck across all workspaces and E2E tests
- `npm run lint` — ESLint check across the monorepo
- `npm run build` — Build `standalone`, `engine`, `server`, and `web`
- `npm test` — Run Vitest unit & integration suites across all 4 workspaces
- `npm run test:e2e` — Build all packages and run Playwright Chromium E2E tests (requires Playwright browser install: `npx playwright install chromium`)
