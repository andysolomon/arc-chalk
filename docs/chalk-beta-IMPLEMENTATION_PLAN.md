# Chalk Production Beta Implementation Plan

Status: in progress
Mode: parity-first replatform and production gap build
Companion tracker: `docs/chalk-beta-progress.txt`

## 1. Product goal and scope boundaries

Build an invite-only, production-quality Chalk beta for individual football coaches by faithfully reimplementing the design- and feature-complete `Chalk Football Play Editor-2/Chalk Play Editor.dc.html` on the accepted production architecture. A Coach must retain every familiar original workflow while gaining stronger durability, deployment, privacy, offline behavior, performance, and multi-device continuity.

The restored `Chalk Football Play Editor-2/` directory is the canonical source package. The original prototype is the visual and behavioral specification. The production build must be user-facing identical: a Coach should not need to relearn, rediscover, or reinterpret existing behavior. This is not a redesign and not a reduced MVP. No original feature, mode, menu action, shortcut, Formation/defense behavior, animation capability, library workflow, or coaching output may be omitted or materially changed without explicit product-owner approval.

The product must feel immediate on a ninth-generation iPad and a five-year-old laptop. Local editing and saving never wait for authentication, Convex, object storage, or any other network service.

Beta includes:

- Full visual and behavioral parity with every capability recorded in `docs/original-prototype-parity-matrix.md`.
- Offense, Defense, and Special Teams Plays in one consistent model.
- Optional Concepts, built-in and custom Play Types, Personnel Labels, flexible Tags, reusable Formations, and versioned Field Profiles.
- Mouse, touch, Apple Pencil/stylus, and keyboard editing on desktop and tablet.
- Deterministic route timing, pre-snap motion, playback, pause, speed control, and scrubbing in the editor and Share Links.
- Continuous device-local persistence, explicit named versions, persistent per-Play undo, multi-device cloud synchronization, and preserved conflicts.
- Private image attachments and external Film References.
- Every original output: PNG, SVG, field print, practice cards, call sheet, install page, position view, quiz/answer key, slide, wristband, scout card, progression strip, full Playbook, and frame-sequence animation export.
- Phone read-only, presentation, Share Link, and export workflows.

Beta excludes teams, organizations, shared editing, roster management, comments, public discovery, recipient accounts, hosted video, live collaboration, CRDTs, end-to-end encryption, GIF/MP4 encoding, and automated play recommendations. An item is not excluded if the original prototype already implements it.

## 2. Current baseline

- `Chalk Football Play Editor-2/Chalk Play Editor.dc.html` is the design- and feature-complete canonical product specification. Its single-file implementation is not the production foundation, but its visible and behavioral result is the required target.
- The reviews in `docs/reviews/` document defects to fix and evidence gaps to close; they do not authorize a redesign.
- `CONTEXT.md` defines the accepted domain language.
- ADRs 0001–0039 define the production architecture and the non-negotiable prototype-parity rule.
- Phase 1 is implemented: the repository now has a boundary-oriented Bun workspace, Vite/React/TypeScript PWA shell, root Convex boundary, all accepted package seams, strict shared tooling, dependency-direction enforcement, and Vitest plus Chromium/WebKit Playwright smoke coverage.
- The first production editor-shell slice recreates the original header, modes, field-first workspace, tool rail, seeded `Stick — Thunder` field, inspector, timeline, and status treatment. It is comparison scaffolding, not a claim that Phase 4 visual or behavioral parity is complete.
- `docs/parity/` contains the first original-versus-production editor comparison plus a Bun-hosted Playwright harness that locks the original Editor, Demo, Present, and Print desktop modes and seven global editor overlays at 1440 × 960. Remaining panels, menus, modals, selection states, additional viewports, behaviors, and outputs are incomplete.
- The first Phase 2 tracer extracts the original runtime's seeded `Stick — Thunder` Play into a strict Zod Mini production document, migrates its 12-units-per-yard canvas into centered LOS-relative yard space, and proves canonical serialization/SHA-256, exact double mirroring, integer-millisecond movement evaluation, and deterministic framework-free `RenderScene` construction. The remaining Phase 2 schemas, curves, snapping, landmarks, primitives, and golden coverage are still open.
- The restored `plans/phase-*` documents record features already landed in the prototype and are parity evidence alongside direct source/runtime capture.
- `Chalk Beta Design Prototype.html` is a rejected alternate design exploration and is not a production target.

## 3. Full capability map

| Capability | Beta target | Primary boundary |
|---|---|---|
| Prototype parity | Original visuals, workflows, controls, modes, shortcuts, outputs, and coaching language remain intact | workspace-wide parity suite |
| Domain | Stable IDs, immutable revisions, strict schemas, explicit migrations | `packages/domain`, `packages/contracts` |
| Geometry | Yard-space truth, versioned fields, structured paths, exact mirroring and snapping | `packages/domain`, `packages/editor` |
| Rendering | One deterministic `RenderScene` for editor, animation, sharing, and exports | `packages/render` |
| Local durability | IndexedDB/Dexie repositories, atomic current state, mutations, history, and recovery | `packages/local-db` |
| Editor | Responsive SVG workspace with unified pointer, Pencil, touch, and keyboard input | `apps/web`, `packages/editor` |
| Library | Virtualized, metadata-first navigation, local search, lazy derived thumbnails | `apps/web`, `packages/local-db` |
| Cloud | Clerk identity, Convex replica/functions, durable cursor sync, branch conflicts | `convex`, `packages/sync` |
| Assets | Sanitized local images synchronized to private content-addressed R2 objects | `apps/web`, `convex`, R2 |
| Sharing | Immutable sanitized publications behind revocable fragment-capability URLs | `apps/web`, `convex` |
| Outputs | Offline-capable SVG/PNG/PDF/print generated from the shared scene | `packages/exports`, `packages/render` |
| Operations | Isolated environments, privacy-preserving monitoring, backup and restore drills | deployment and operations config |
| Quality | Layered tests, accessibility checks, performance budgets, physical-device gates | workspace-wide |

## 4. Milestones and phases

### Phase 0 — Canonical prototype inventory and parity lock

Goal: turn the complete restored prototype into an auditable visual, behavioral, data, shortcut, and output specification before production implementation.

Deliverables:

- ADR 0039 and `docs/original-prototype-parity-matrix.md` establishing the restored prototype as the canonical specification.
- Screenshot baselines for every top-level view, panel, menu, modal, selection state, and supported viewport.
- A source-and-runtime-verified inventory of every control, action, mode, shortcut, gesture, persistence transition, sample, and output.
- Golden serialized documents and generated output samples spanning every supported primitive and workflow.
- Automated behavior scripts for the original happy paths and corrected expectations for each verified defect.

Dependencies: accepted product decisions, the restored source package, the running original prototype, existing tests, phase plans, and reviews.

Risks: source-only inventory can miss runtime states, while screenshot-only parity can miss behavior. Both evidence types are required.

Acceptance criteria:

- Every reachable original capability maps to an owned production phase and parity test.
- Every top-level visual state and output has a named golden baseline.
- Known prototype bugs are distinguished explicitly from intended behavior.
- No redesign exploration is referenced as a production target.

### Phase 1 — Workspace and architectural guardrails

Goal: establish an executable Bun workspace whose package boundaries encode the accepted architecture.

Deliverables:

- Vite + React + TypeScript PWA shell in `apps/web` using TanStack Router.
- Workspace packages: `domain`, `contracts`, `editor`, `render`, `local-db`, `sync`, `exports`, and `test-fixtures`, plus the root `convex/` backend.
- Shared strict TypeScript, lint, formatting, unit-test, browser-test, and build commands.
- Dependency-direction checks that keep domain code independent of React, Dexie, Convex, and browser APIs.
- Environment templates and local setup documentation without committed secrets.

Dependencies: accepted ADRs and domain language.

Risks: allowing framework types to leak inward would make later local-first and rendering work difficult to test or replace.

Acceptance criteria:

- A clean Bun install can typecheck, test, and build the workspace.
- The web shell opens locally and routes without a network dependency.
- Package-boundary tests reject forbidden inward dependencies.

### Phase 2 — Domain, geometry, and deterministic rendering core

Goal: make football documents and visual output deterministic before building editor controls.

Deliverables:

- Zod Mini schemas and migrations for Coach-owned Playbooks, Plays, immutable revisions, Concepts, Formations, Field Profiles, classifications, Players, Assignments, paths, and publications.
- Client-generated stable IDs, canonical hashing, schema-version envelopes, and deterministic serialization.
- Centered, line-of-scrimmage-relative yard geometry; field landmark calculations; geometry-first mirroring; and smart-snap candidate ranking.
- Absolute integer-millisecond motion and route evaluation.
- Framework-free `RenderScene` construction and accessible SVG rendering primitives.
- Golden fixtures and property tests covering round trips, double mirrors, boundary geometry, and animation determinism.

Dependencies: Phase 1.

Risks: rounding drift or renderer-specific data would corrupt replay, mirroring, sync comparisons, and exports.

Acceptance criteria:

- The same revision and timestamp always produce the same canonical hash and scene.
- Mirroring twice restores the exact canonical document.
- Geometry and animation tests pass without React, IndexedDB, or network services.

### Phase 3 — Local database, durability, and recovery

Goal: make the device-local database the authoritative interactive store.

Deliverables:

- Dexie 4 implementation behind typed repositories for Playbooks, Plays, immutable revisions, sync mutations, conflicts, preferences, private image blobs, undo history, search projections, and thumbnail derivatives.
- Transactional local commits with save acknowledgement under 50 ms at beta scale.
- Bounded, persistent, hash-guarded per-Play undo/redo using semantic commands.
- Continuous local saving, explicit named versions, Trash with 30-day retention, and crash-safe startup recovery.
- Persistent-storage request UX, quota monitoring, and actionable storage-pressure handling.
- Migration fixtures representing every released schema and tests upgrading real older IndexedDB databases.
- Encrypted portable backup and verified import paths.

Dependencies: Phase 2 domain schemas and hashes.

Risks: browser eviction, partial transactions, stale undo commands, and broken migrations could lose a Coach's season.

Acceptance criteria:

- Creating, editing, closing, reopening, undoing, and restoring a Play work fully offline.
- A failed or interrupted write leaves either the prior valid state or the complete new state.
- Migration and backup round-trip suites preserve current work and immutable versions.

### Phase 4 — Production editor and responsive interaction model

Goal: deliver the core diagramming workflow with fast, accessible input across desktop and iPad.

Deliverables:

- A faithful recreation of the original shell, palette, type, density, iconography, field proportions, panels, and control states. Tailwind CSS 4, shadcn/ui, Base UI, and Lucide may support internals but must not impose a different default appearance.
- Chalk-owned vanilla Zustand `EditorStore` separating transient gestures from committed domain state.
- Unified pointer state machine for mouse, touch, Pencil/stylus, and keyboard operations.
- Every original direct-manipulation behavior: selection/marquee/multi-select, pan/zoom/pinch/minimap, player and label tools, route nodes/curves/segments/branches/alternates, route kinds and styling, assignments/reads/conversions/notes, snapping, mirroring, copy/paste, contextual actions, and clear-by-layer.
- Every original football workflow: Formation/defense libraries and favorites, pinned previews, role-aware realignment, semantic strength flip, ball hash, line calls, quick routes/blocks/defensive presets, Concepts, edit scopes, and route rules.
- Original Editor, Demo/Tour, Present, and Print modes; panel/focus behavior; command palette; keyboard shortcuts; help; typography presets; annotation layers; and status feedback.
- Keyboard navigation, visible focus, meaningful SVG accessibility, reduced-motion behavior, and screen-reader-compatible controls.
- Desktop and iPad full-editor layouts plus safe read-only phone behavior.

Dependencies: Phases 2–3.

Risks: committing during pointer movement, oversized React render surfaces, or gesture ambiguity will violate latency and undo guarantees.

Acceptance criteria:

- Each completed gesture creates exactly one local transaction and undo entry.
- Editor interaction sustains 60 FPS and p95 input-to-paint below 50 ms on target devices.
- Core editing workflows pass keyboard, touch, Pencil, and automated accessibility checks.
- Golden screenshots and interaction scripts match the canonical prototype within approved defect and accessibility exceptions.

### Phase 5 — Deterministic animation and playback

Goal: animate the same yard-based document that the editor and static renderer use.

Deliverables:

- Timeline authoring for pre-snap motion, route starts, segment duration, and coordinated Play timing.
- Play, pause, restart, speed controls, and deterministic scrubbing.
- Integer-millisecond playback clock that isolates transient presentation state from the stored Play.
- Shared playback behavior for private editor and read-only Share Link presentation.
- Reduced-motion and keyboard-operable playback controls.

Dependencies: Phases 2 and 4.

Risks: wall-clock integration or duplicated geometry would make scrubbing nondeterministic and exports disagree with the editor.

Acceptance criteria:

- Scrubbing to a timestamp yields the same positions as uninterrupted playback at that timestamp.
- Playback never mutates the saved Play and remains responsive while offline saves or sync run.

### Phase 6 — Playbook library, organization, and retrieval

Goal: preserve the original in-editor Concept/variation library exactly while extending it safely to season scale.

Deliverables:

- Playbook and Play CRUD with required Unit and optional Concept, Play Type, Personnel Label, and Tags.
- Built-in classifications plus Coach-created and renamed values without forced deeper hierarchy.
- TanStack Virtual lists/grids with paged metadata, stable focus, and restored scroll position.
- Worker-built local full-text search projections and filters with under-50-ms response at 2,000 Plays.
- Lazy, cancelable, revision-keyed derived thumbnails generated behind interactive work.
- Formation and Field Profile management with explicit version and reapply behavior.
- Original Concept tree, variation creation/naming, collapse state, edit scopes, propagation/skip feedback, detach, rename, delete, save/update, and guarded transitions.
- The original library panel remains available; any dedicated Playbook browser is additive rather than a replacement.

Dependencies: Phases 2–4.

Risks: loading revisions or rendering thumbnails eagerly will exhaust memory and block navigation.

Acceptance criteria:

- A 2,000-Play fixture opens, searches, filters, scrolls, and returns from editing within the performance budgets.
- Deleting derived search or thumbnail data is harmless and rebuilds automatically.

### Phase 7 — Authentication, Convex replica, and conflict-safe sync

Goal: add optional cloud durability and multi-device continuity without weakening offline editing.

Deliverables:

- Invite-only Clerk email-code authentication with optional passkeys and local-edit access independent of session refresh.
- Strict Convex schema and public function validation using native `v`; shared domain validation at trust boundaries.
- Idempotent push batches, durable local mutation queue, cursor-based pull, acknowledgements, backoff, retry, and compact sync-head signaling.
- Immutable cloud revisions, tombstones, per-Coach authorization, schema-version compatibility, and bounded payload enforcement below the Convex document limit.
- Non-blocking Conflict Inbox with compare, choose, keep-both, and manual-combine flows.
- Offline, intermittent-network, duplicate-delivery, out-of-order, revoked-session, and two-device convergence tests.

Dependencies: Phases 2–3; library UI from Phase 6 for conflict surfaces.

Risks: implicit Convex reactivity or server-assigned entity identity could bypass the durable queue and create divergent ownership rules.

Acceptance criteria:

- Local save and undo remain usable while signed out or offline.
- Replayed batches are idempotent, cursors resume safely, and genuine divergence is preserved for Coach resolution.
- Two devices converge after reconnecting without silently overwriting either branch.

### Phase 8 — Private assets and immutable Share Links

Goal: support lightweight visual context and safe read-only sharing.

Deliverables:

- Worker-based JPEG/PNG/WebP/browser-HEIC validation, orientation, metadata stripping, resizing, thumbnailing, hashing, and local-first persistence.
- Private content-addressed R2 upload/download using short-lived signed access coordinated through authenticated Convex functions.
- Immutable sanitized Share Publications for one Play or curated Play sets.
- Stable `/s/{publicId}#{secret}` fragment-capability links using keyed token hashes, revocation, republishing, expiry controls, and access audit events.
- Static share shell with strict CSP, no third-party scripts, no token leakage, and accessible read-only playback.
- External Film Reference validation and display without proxying or caching video.

Dependencies: Phases 2, 5, and 7.

Risks: EXIF leakage, bearer URLs, fragment leakage, or accidentally publishing internal fields would violate the product's privacy promise.

Acceptance criteria:

- Original metadata is absent from processed images and unauthorized R2 reads fail.
- Revoking a link stops access; republishing changes content without changing the Coach's URL.
- Share routes send no secret or private content to logs, analytics, referrers, or third parties.

### Phase 9 — Authoritative static coaching outputs

Goal: generate accurate, reusable coaching materials from the same rendering model as the editor.

Deliverables:

- SVG and high-resolution PNG export with deterministic dimensions and fonts.
- Print the field, practice cards, call sheet, install page, position view, quiz with answer key, slide, wristband, scout card, progression strip, and full Playbook generation with original options and semantics.
- Frame-sequence animation export and manifest matching original behavior, without adding GIF or MP4 encoding.
- Pagination, repeated headers, overflow handling, and accessible export dialogs.
- Golden-image, structural SVG, and PDF content tests using representative fixtures.

Dependencies: Phases 2, 4, and 6; asset inclusion rules from Phase 8.

Risks: browser-only layout assumptions and font differences could make exports inconsistent or unreadable.

Acceptance criteria:

- Static exports match the current immutable revision and remain authoritative when animation exists.
- Export works offline for locally available data and never mutates the Play.
- Dense beta fixtures paginate without clipped diagrams or coaching text.
- Every original Export-menu action has a parity fixture and produces an equivalent or corrected output.

### Phase 10 — PWA lifecycle, offline UX, and device hardening

Goal: make installation, startup, updates, and failure states trustworthy.

Deliverables:

- Workbox `injectManifest` service worker caching only the versioned application shell and safe static assets.
- IndexedDB-only authoritative data path; no duplicated Play data in Cache Storage.
- Install affordances, offline and sync status, storage health, recoverable error messages, and explicit update prompts.
- App-shell rollback compatibility and expand-backfill-contract migrations across deployed versions.
- Browser/device matrix covering supported desktop browsers, ninth-generation iPad, Pencil, touch, keyboard, and phone read-only flows.

Dependencies: Phases 3–9.

Risks: an uncontrolled service-worker update could strand a client between incompatible code and data schemas.

Acceptance criteria:

- Warm/offline startup is under 1 second and cold online startup under 2.5 seconds on target devices.
- Updating never discards a committed local edit and offers a clear recovery path after an incompatible cached shell.
- All primary offline workflows run with the network forcibly disabled.

### Phase 11 — Security, observability, backup, and environment operations

Goal: operate the beta without collecting sensitive football content or relying on untested recovery claims.

Deliverables:

- Separate development, PR preview, staging, and production Clerk/Convex/R2/Sentry configuration.
- Authorization tests for every Convex function and asset path; rate limits and abuse controls for authentication and sharing.
- Privacy-scrubbed Sentry errors and native operational metrics with no session replay or product analytics.
- Secret scanning, dependency and supply-chain review, CSP and security-header tests, and a documented incident runbook.
- Daily Convex backups, weekly off-platform backups retained 90 days, content-addressed R2 retention/lock policy, and restore tooling.
- Monthly restore drill procedure proving 24-hour RPO and four-hour RTO targets.
- `main` as the primary development/release branch, Conventional Commit history, Bun-based PR and merge gates, and semantic-release-driven Git tags and GitHub Release notes. Tags are authoritative; the private workspace is never published to npm and release automation does not write commits back to protected `main`.

Dependencies: Phases 7–10 for production operations; remote `main`, GitHub Actions, and branch protection are required for automated releases.

Risks: telemetry or backup systems can become an unintended copy of private Play content.

Acceptance criteria:

- Production-like staging proves authorization, redaction, backup, and restore behavior with synthetic data.
- A timed restore drill meets RPO/RTO and documents evidence and corrective actions.
- Promotion to production is explicit and cannot occur from an unreviewed preview deployment.
- A semantic-release dry run calculates the expected version from Conventional Commits without publishing, and the release workflow can run only from `main`.

### Phase 12 — Beta validation and controlled release

Goal: prove the complete Coach workflow and release only when durability, usability, and performance gates pass.

Deliverables:

- End-to-end journeys for invite, first Playbook, offline edit, reopen, animation, search, export, sync, conflict, share, revoke, Trash, backup, and recovery.
- Automated accessibility audit plus keyboard-only, screen-reader, touch, and Pencil manual scripts.
- Performance harness with 10 Playbooks and 2,000 Plays per Playbook, capturing startup, open, save, input-to-paint, playback, search, sync, and export measurements.
- Physical-device test evidence for a ninth-generation iPad and a five-year-old laptop.
- Beta support, feedback, incident, data export, account deletion, and rollback procedures.
- Explicit release checklist and production promotion record.
- Completed feature, visual, interaction, shortcut, gesture, data-migration, and output parity matrix with evidence links.

Dependencies: all preceding phases.

Risks: desktop-only automation can conceal iPad memory, Pencil, Safari storage, and real-network failures.

Acceptance criteria:

- All ADR 0021 release gates pass with recorded evidence and no unresolved severity-one durability, privacy, accessibility, or data-loss defect.
- A Coach can complete the full critical journey under normal, offline, and reconnect conditions.
- No original capability is missing, materially relocated, or materially restyled without an explicit approved exception.
- Production promotion is approved explicitly; deployment is not implied by completing this plan.

### Phase 13 — Ship and archive planning artifacts

Goal: close the tracked beta build cleanly after production acceptance.

Deliverables:

- Final verification record, release notes, and known deferred work.
- `docs/chalk-beta-IMPLEMENTATION_PLAN.md` and `docs/chalk-beta-progress.txt` moved together to `docs/archive/` after every progress item is complete and the shipping change is merged.

Dependencies: Phase 12 and explicit user authorization for any push, merge, or deployment.

Risks: archiving early would hide unfinished beta obligations.

Acceptance criteria:

- Every tracker item is checked, production acceptance evidence is linked, and both files are archived in one change.

## 5. Out of scope and deferred

- Teams, organizations, roles beyond the owning Coach, collaboration, comments, approval workflows, and live multi-user editing.
- Rostered athletes and athlete-linked analytics.
- Hosted film upload, transcoding, streaming, downloads, or offline film.
- Public galleries, discovery, marketplace, and recipient accounts.
- End-to-end encrypted cloud content.
- GIF and MP4 encoding; the original frame-sequence export remains in scope.
- Automated play recommendations. Original quiz and presentation-slide outputs remain in scope.
- Any unapproved redesign, feature reduction, workflow consolidation, or removal of an original mode, control, or output.
- Native iOS/Android apps; the installable web app is the beta client.
- SQL/PostgreSQL, Supabase, Dexie Cloud, CRDTs, and an external search service.

## 6. Immediate next steps

1. Continue the item-level parity inventory and golden captures from the restored original; do not use the rejected alternate design as a target.
2. Begin Phase 2 with canonical Play/Player/Path fixtures extracted from the original, then implement yard geometry and deterministic `RenderScene` output behind the current shell.
3. Replace the shell's illustrative SVG only through tested render/domain seams while preserving its original appearance.
4. Record only explicit product-owner-approved parity exceptions; implementation convenience is not an exception.
5. Close each parity group end-to-end with Coach-visible tests and original-versus-production evidence.
6. Keep `docs/chalk-beta-progress.txt` synchronized as each executable slice lands.
