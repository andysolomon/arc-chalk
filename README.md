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

Clerk and Convex are optional. Leave `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_CONVEX_URL` empty to edit entirely on this device. When both are set, Account in the More menu offers invitation-only email codes and optional passkeys; local save and undo keep working signed out or offline. Cloud coding agents should set `CONVEX_AGENT_MODE=anonymous` and use `npx convex dev` for an isolated development deployment. Never use `npx convex deploy` during development — that command is for production only.

Useful checks:

```sh
bun run check
bun run test:watch
bun run check:boundaries
bun run test:parity
```

`bun run capture:parity` deliberately updates the canonical prototype screenshots. Use it only after confirming that the restored original is the intended source state; ordinary verification uses `bun run test:parity` and fails on visual drift.

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

## Versioning and commits

The primary development branch is `main`. Commit messages follow Conventional Commits:

```text
fix: correct route endpoint placement
feat(editor): add choice-route branches
feat!: replace an incompatible document contract
```

`fix` releases a patch, `feat` releases a minor, and a `BREAKING CHANGE` or `!` releases a major version. semantic-release analyzes commits on `main`, creates the authoritative Git tag and GitHub Release notes, and does not publish this private workspace to npm or write release commits back to protected `main`.

Validate release calculation without publishing:

```sh
GH_TOKEN=$(gh auth token) bun run release:dry-run
```
