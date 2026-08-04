---
status: accepted
---

# Organize Chalk as a boundary-oriented Bun workspace

Chalk uses one repository and Bun lockfile with workspace packages that enforce the accepted domain, editor, rendering, local persistence, synchronization, export, and cloud boundaries. The workspace does not add a separate task orchestrator until measured build times justify one.

## Consequences

- `apps/web` contains the Vite React PWA, routes, UI composition, service-worker registration, and provider wiring.
- `convex` contains Convex schema, functions, adapters, and generated APIs.
- `packages/domain` contains pure football terminology, models, commands, revisions, and domain migrations.
- `packages/contracts` contains versioned synchronization, Share Publication, and other boundary contracts.
- `packages/editor` contains EditorStore, tools, selection, input gestures, and playback coordination.
- `packages/render` contains coordinate transforms, path sampling, RenderScene construction, and SVG adapters.
- `packages/local-db` contains Dexie repositories, IndexedDB migrations, persistence status, and storage diagnostics.
- `packages/sync` contains the durable queue orchestrator and Convex synchronization adapter.
- `packages/exports` contains SVG, PNG, PDF, and print-template composition.
- `packages/test-fixtures` contains representative Plays, legacy databases, output fixtures, and performance datasets.
- `docs` contains reviews, ADRs, architecture guidance, and the Wayfinder work map.
- Dependency direction is `web → editor/render/local-db/sync/exports → domain`; Convex depends on contracts and domain-safe code. Domain imports no UI, storage, network, or provider package.
- TypeScript project references and shared lint and test configuration validate boundaries under one Bun workspace.
- Turborepo or another task orchestrator is deferred until profiling demonstrates a need.

