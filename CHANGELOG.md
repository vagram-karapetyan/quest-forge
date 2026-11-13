# Changelog

All notable changes to Quest Forge v2 will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initialized Quest Forge v2 monorepo workspace (`0.1.0`) with npm workspaces, strict TypeScript, ESLint, Prettier, and Vitest.
- Implemented `@quest-forge/engine` pure TypeScript core: Zod v2 domain & portable JSON schemas, deterministic game runtime (inventory, typed variables, conditions/effects, float rounding safety, `{var}` interpolation, `MAX_UNDO_STEPS = 50` undo stack, structured `code + params` events), safe Markdown renderer with URL whitelist, static graph analyzer, BFS auto-layout, `RU`/`EN` i18n, shared 3-theme CSS (`Night`, `Parchment`, `Cyber`), and Standalone HTML compiler.
- Implemented `@quest-forge/standalone` offline HTML player shell bundled via esbuild into an IIFE asset with `localStorage` persistence, hotkeys (`1–9`, `Z`, `Space`/`Enter`), typewriter effect, and media support.
