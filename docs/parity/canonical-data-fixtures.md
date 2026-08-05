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
- The prototype stored high-school `53′4″` hash placement in feet; the versioned production Field Profile stores the equivalent `17.777…`-yard sideline inset explicitly.
- The raw captured fixture remains available through `originalStickThunder`; `stickThunderPlay` is its strict schema-version-2 production migration.

Current automated evidence covers schema parsing, the v1-to-v2 profile migration, exact legacy-coordinate round trips, exact double mirror, canonical key ordering and SHA-256, deterministic integer-millisecond movement evaluation, deterministic `RenderScene` construction, and deterministic projection of Field Profile markings plus the seeded players, routes, branch, tick, and labels into the production editor SVG.

## Path primitive coverage

Source: the original prototype's route editor, coverage presets, SVG marker definitions, curve evaluator, and live-canvas rendering rules.

Production fixture: `packages/test-fixtures/src/football-path-primitives.ts`

Captured coverage:

- Route, motion, block, zone, blitz, stunt, and ball path kinds
- Solid, dashed, dotted, and deterministic zigzag lines
- Arrow, bar, dot, bubble, hook, chevron, diamond, square, and no-ending behavior across whole paths and segment overrides
- Quadratic curves sampled from the same yard-space geometry used to render them
- Choice branches, alternate routes, block ticks, and sized semantic coverage areas
- Original ink, blue, red, green, orange, gray, and yellow color tokens

The fixture verifies strict schema parsing, bounded curve sampling, yard-distance evaluation, exact double mirroring without metadata loss, deterministic scene projection, and Coach-visible React SVG output. Phase 0.5 remains open until the remaining player, label, Formation, defense, Concept, timing, and output fixtures are captured.
