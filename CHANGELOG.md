# Changelog

All notable changes to Quest Forge v2 will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initialized Quest Forge v2 monorepo workspace (`0.1.0`) with npm workspaces, strict TypeScript, ESLint, Prettier, and Vitest.
- Implemented `@quest-forge/engine` pure TypeScript core: Zod v2 domain & portable JSON schemas, deterministic game runtime (inventory, typed variables, conditions/effects, float rounding safety, `{var}` interpolation, `MAX_UNDO_STEPS = 50` undo stack, structured `code + params` events), safe Markdown renderer with URL whitelist, static graph analyzer, BFS auto-layout, `RU`/`EN` i18n, shared 3-theme CSS (`Night`, `Parchment`, `Cyber`), and Standalone HTML compiler.
- Implemented `@quest-forge/standalone` offline HTML player shell bundled via esbuild into an IIFE asset with `localStorage` persistence, hotkeys (`1–9`, `Z`, `Space`/`Enter`), typewriter effect, and media support.
- Implemented `@quest-forge/server` Fastify backend with SQLite (`better-sqlite3` + Drizzle ORM + versioned SQL migrations), dynamic version reading from root `package.json`, demo seeder for both v2 demo quests (12 and 25 scenes), REST API for catalog/builder/layout/game/import/export, timing-safe DB-backed author auth, trusted-proxy-aware rate limiter with TTL cleanup, stale game session cleanup, and integration test suite.
- Implemented `@quest-forge/web` React 19 + Vite frontend reusing `@quest-forge/engine` (`themes.css`, `i18n`, types): responsive catalog with instant search, metadata badges, JSON import/export, Standalone HTML download, native `<dialog>` auth & confirmation modals, and atmospheric web player with 3 themes, `EN`/`RU`, typewriter effect, media controls, hotkeys, Undo, and decision log.
- Implemented visual 2D quest builder (`/builder/:questId`) and graph core: added pure graph geometry & viewport/collision helpers (`buildSceneGraph`, `computeFitViewport`, `suggestNewScenePosition`) to `@quest-forge/engine`; built theme-variable-styled 2D graph canvas with pan/zoom, fit/reset view, BFS auto-layout, pointer & keyboard node dragging, race-free serialized save & layout queues (`LayoutSaveQueue`, `SerializedSaveRunner`), searchable scene list panel, scene/choice/condition/effect visual inspector (without raw JSON), initial variables editor, live validator tab with scene jump, author auth guard, and Vitest suites covering all 4 workspaces (`engine`, `standalone`, `server`, `web`).
