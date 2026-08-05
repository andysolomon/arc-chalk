# Canonical prototype data fixtures

## `Stick — Thunder`

Source: the running restored prototype's `fpd.current.v1`/`fpd.plays.v1` local-storage records at the seeded initial state.

Production fixture: `packages/domain/src/seed-stick-thunder.ts`

Captured coverage:

- 11 offensive Players, including circle and square symbols, labels, and sublabels
- 5 routes with attached Player IDs, route nodes, one tick, solid/dotted styling, arrow/dot endings, and a branch
- 12 labels with blue reads, ordinary text, red outline, and yellow fill treatments
- Play name, built-in Play Type, tags, Concept note, and high-school Field Profile

Migration contract:

- The prototype's document units are 12 units per yard.
- Prototype midfield `x = 500` becomes `lateralYards = 0`.
- Prototype line of scrimmage `y = 430` becomes `depthYards = 0`.
- Positive lateral yards point toward the prototype's right side.
- Positive depth yards point upfield.
- The raw captured fixture remains available through `originalStickThunder`; `stickThunderPlay` is its strict schema-version-1 production migration.

Current automated evidence covers schema parsing, exact legacy-coordinate round trips, exact double mirror, canonical key ordering and SHA-256, deterministic integer-millisecond movement evaluation, deterministic `RenderScene` construction, and deterministic projection of the seeded players, routes, branch, tick, and labels into the production editor SVG. This is the first data golden only; Phase 0.5 remains open until every primitive and parity group is represented.
