# Canonical prototype behavior scripts

Each parity group has an automated script. Defect rows document what the original **does**, then point at the production test that encodes the corrected expectation.

## Original happy paths

| Group | Script | Asserts |
| --- | --- | --- |
| Seeded working Play | `tests/parity/original-behavior.spec.ts` | Title `Stick — Thunder`; `fpd.current.v1` |
| Undo | `tests/parity/original-behavior.spec.ts` | Deleting Q then `Control+z` restores the letter |
| Formation browser | `tests/parity/original-behavior.spec.ts` | Gun Doubles Right is listed |
| Present → editor | `tests/parity/original-behavior.spec.ts` | Escape restores the editor chrome |
| Persistence keys | `tests/parity/original-behavior.spec.ts` | `fpd.current.v1`, `fpd.plays.v1`, `fpd.examples.v15` |
| Command-surface copy | `tests/parity/capability-inventory.test.ts` | shortcutRows, export groups, More verbs, Clear labels, `fpd.*` keys |
| Top-level visuals | `tests/parity/original-prototype.spec.ts` | Named goldens in `docs/parity/screenshots/` |

## Timing

| Group | Script | Asserts |
| --- | --- | --- |
| Finding #6 heading independence | `tests/domain/timing-primitives.test.ts` | Equal 10-yard V/H stems share `movementDurationMs` |
| Delayed jet | `tests/domain/timing-primitives.test.ts` | wait 200 ms, hold 400 ms, deterministic timestamp |
| Fixture | `packages/test-fixtures/src/timing-primitives.ts` | Schema-valid Play covering those stems |

Phase 5 still owns playback UI, speed controls, and scrubbing.

## Documented original defects

| Defect | Original script (what it does) | Production corrected script | Phase |
| --- | --- | --- | --- |
| B1 demo handoff | original-behavior: Defense → Open this play keeps `curPlayId` bound to Stick — Thunder | `tests/e2e/editor-shell.spec.ts` "opens a demo into a new Play" | 4.1 |
| B2 unsaved play switch | Matrix row; library not yet rebuilt | Phase 6.1 e2e when the library lands | 6.1 |
| #1 zones missing from export | Static review; original `exportSvgBody` never calls `zoneOf` | RenderScene unit tests; file golden owed by 9.4 | 2.3–2.4 / 9.4 |
| #2 silent save failure | Static review | Phase 3.2 save-acknowledgement tests | 3.2 |
| #3 anisotropic yards | Static review | `tests/domain/field-scale.test.ts` | 2.2 |
| #4 live edits bypass commit | Static review | EditorStore / command tests in Phase 3.2–3.3 | 3.2 / 3.3 |
| B3 empty-doc recovery | Behavioral review | Phase 3.4 recovery tests | 3.4 |
| #5 first-match formation roles | Static review; production `recognizeFormation` still first-match by role | Phase 6.2 | 6.2 |
| #6 animation speed vs heading | timing-primitives (production evaluator already yard-true) | Same file | 2.3 |
| #7 advertised `1–9` read order | original-behavior: digit `1` with a selected route leaves Read empty | Remaining 4.1: wire `1–9` onto `setRouteReadCommand` | 4.1 |
| #8 insertDefense blue-letter heuristic | Static review | `applyDefensiveCall` clears by unit/binding, not letter color | 4.4 |
| #9 exportFrames 40-cap | Static review | Phase 9.3 | 9.3 |
| #10 silent print popup failure | Static review | Phase 9.4 | 9.4 |
| #11 isLineman hardcoded depth | Static review; production still uses converted y=448 | Phase 6.2 | 6.2 |
| #12 playbook page numbers | Static review | Phase 9.2 | 9.2 |
| #13 clone-per-pointermove | Static review | Transient preview in the interaction machine | 4.2 |
| B4 named snapshot relabeled Autosave | Behavioral review | Phase 3.4 named versions are append-only | 3.4 |
| B5 unpkg offline | Behavioral review | Vite/PWA, no unpkg React | 1 / 10 |
| B6 touch/context incomplete | Behavioral review | Phase 4.3 context menu + Phase 4.5 Pencil/phone | 4.3 / 4.5 |
| B7 keyboard on library/pickers | Behavioral review | Formation/defense search keys in 4.4; library rows remain 6.1 | 4.4 / 6.1 |

## Production shell ratchets

`tests/parity/production-shell.spec.ts` measures the live pixel gap against the original's own desktop goldens. New original goldens added in Phase 0 are **not** production ratchets; later Phase 4.1 work may add them.
