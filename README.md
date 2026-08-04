# Chalk

Chalk is a local-first football play editor and Playbook for an individual coach.

The production app is a parity-first reimplementation of the design- and feature-complete `Chalk Football Play Editor-2/Chalk Play Editor.dc.html`. Internal architecture may change; the Coach-facing design, workflows, controls, shortcuts, interactions, and outputs may not change without an approved parity exception.

## Local development

Requirements: Bun 1.2.19 or newer.

```sh
bun install
cp .env.example .env.local
bun run dev
```

The editor is then available at `http://127.0.0.1:4173` and does not require a network service to open.

Useful checks:

```sh
bun run check
bun run test:watch
bun run check:boundaries
```

## Workspace boundaries

- `apps/web` — Vite, React, routing, application composition, and PWA shell
- `packages/domain` — framework-free football documents and commands
- `packages/contracts` — versioned cloud and publication boundaries
- `packages/editor` — tools, selection, gestures, and playback coordination
- `packages/render` — yard geometry, path sampling, and deterministic scenes
- `packages/local-db` — IndexedDB/Dexie repositories and migrations
- `packages/sync` — durable Convex synchronization orchestration
- `packages/exports` — authoritative coaching outputs
- `packages/test-fixtures` — representative, migration, output, and scale fixtures
- `convex` — cloud replica and server functions

Dependency direction is checked in CI-ready form with `bun run check:boundaries`.
