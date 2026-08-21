# Canonical prototype capability inventory

Item-level inventory of `Chalk Play Editor.dc.html`. Every row maps to an owned production phase and to the test that locks it. Source strings are asserted by `tests/parity/capability-inventory.test.ts`. Runtime behavior is asserted by `tests/parity/original-behavior.spec.ts` and the existing production suites named in `docs/parity/behavior-scripts.md`.

`Chalk Beta Design Prototype.html` is a rejected exploration and is not a target.

## Modes

| Capability | Original evidence | Production phase | Lock |
| --- | --- | --- | --- |
| Editor | Seeded `Stick — Thunder`, idle inspector | 4.1 | `original-editor-desktop-1440x960.png` |
| Demo / Tour | Five sequences; Pause / Back / Next | 4.1 | `original-demo-desktop-1440x960.png` |
| Present | Full-window field, `esc` back | 4.1 | `original-present-desktop-1440x960.png`; original-behavior Present→Escape |
| Print | Letter-landscape sheet, Print this | 4.1 / 9.4 | `original-print-desktop-1440x960.png` |

## Header and chrome

| Control | Original copy / shortcut | Phase | Lock |
| --- | --- | --- | --- |
| Play title | Editable `Stick — Thunder` | 4.1 / 6.1 | original-behavior seeded title |
| Category | Pass / Run / RPO / Screen / Defense / Special | 4.1 | Editor golden |
| Undo / Redo | `⌘Z / ⇧⌘Z` | 3.3 / 4.1 | original-behavior undo |
| More | Focus mode, Hide zone areas, Mirror, Flip strength, New play | 4.4 | `original-editor-more-menu-desktop-1440x960.png` |
| Export | DIAGRAM / TEACHING / FIELD / BOOK groups | 9.x | `original-editor-export-menu-desktop-1440x960.png` |
| Save | Save, Save as variant, Snapshot | 3.4 / 6.1 | `original-editor-save-menu-desktop-1440x960.png` |
| Snapshot naming | Placeholder `What this state is` | 3.4 | `original-editor-snapshot-desktop-1440x960.png` |
| Command palette | `⌘K`; placeholder `Type a command — formation, defense, export, clear…` | 4.4 | `original-editor-command-palette-desktop-1440x960.png` |
| Shortcuts | `?` / Shortcuts ? | 4.1 | `original-editor-shortcuts-desktop-1440x960.png` |
| Focus mode | More → Focus mode; `F` | 4.1 | `original-editor-focus-mode-desktop-1440x960.png` |
| Tools hidden | `⌥2` | 4.1 | `original-editor-tools-hidden-desktop-1440x960.png` |

Production's Backup action is an approved additive extension and lives inside More rather than adding a header control.

## Tool rail

| Tool | Key | Phase | Lock |
| --- | --- | --- | --- |
| Select | V | 4.2 | shortcut inventory |
| Player | P | 4.3 | shortcut inventory |
| Route | R | 4.3 | shortcut inventory |
| Motion | M | 4.3 | shortcut inventory |
| Block | B | 4.3 | shortcut inventory |
| Zone drop | Z | 4.3 | shortcut inventory |
| Text | T | 4.3 | shortcut inventory |
| Clear menu | Coverage, Routes, Offense, Defense, Text, All | 4.3 | `original-editor-clear-menu-desktop-1440x960.png` |
| Snap | S | 4.3 | shortcut inventory |
| Hide the tools | ⌥2 | 4.1 | tools-hidden golden |

## Inspector states

| State | What the Coach sees | Phase | Golden |
| --- | --- | --- | --- |
| Idle | Formation / Line call / Concept / Defense / Library | 4.1 / 4.4 / 6.1 | Editor golden |
| Player selected | Player panel, letter `Letter — X, Y, Z, Q…` | 4.3 | `original-editor-player-selected-desktop-1440x960.png` |
| Route selected | Kind / line / ending / Coaching / Timing | 4.3 / 5.1 | `original-editor-route-selected-desktop-1440x960.png` |
| Label selected | Meaning | 4.3 | `original-editor-label-selected-desktop-1440x960.png` |
| Context menu | Duplicate, Mirror, Bring forward, Send back, Delete | 4.3 | `original-editor-context-menu-desktop-1440x960.png` |

## Browsers and overlays

| Overlay | Phase | Golden |
| --- | --- | --- |
| Formation browser | 4.4 / 6.2 | `original-editor-formations-desktop-1440x960.png`; original-behavior lists Gun Doubles Right |
| Defense browser | 4.4 | `original-editor-defenses-desktop-1440x960.png` |
| Export → Position view | 9.2 | `original-editor-export-position-desktop-1440x960.png` |

## Shortcuts and gestures

The original `shortcutRows` list (39 pairs) is locked in both sources. Pointer grammar — press-to-drag threshold, Shift-add, marquee, 45° snap, right-click / long-press menu, pinch, two-finger pan, Pencil vs finger — is Phase 4.2–4.5. Finding #7 (`1–9` read order) is advertised and not implemented in the original; production still owes the keyboard binding (remaining 4.1).

## Persistence

Namespace `fpd.`. Keys owned by the original:

| Key | Written when |
| --- | --- |
| `fpd.current.v1` | Autosave of the working document |
| `fpd.plays.v1` | Library |
| `fpd.examples.v15` | Seed guard |
| `fpd.chrome.v1` | Rail / inspector collapse |
| `fpd.history.v1` | Named snapshots and autosave ring |
| `fpd.favdefenses.v1` | Starred calls |
| `fpd.favformations.v1` | Starred sets |
| `fpd.formations.v1` | Coach-saved sets |
| `fpd.libraryOpen.v1` | Concept-tree disclosure |

First load always writes current / plays / examples. The remaining keys are written on first use. Production maps these to IndexedDB (Phase 3) and preference keys (Phase 4.4 favorites).

## Samples

| Sample | Where it lives | Phase |
| --- | --- | --- |
| Stick — Thunder | Seeded working Play | 2.5 / 4.1 |
| Four Verticals, Smash, Outside Zone — Pull, Cover 3 — Fire Zone, Jet Touch Pass | Example library | 6.1 |
| Eighteen stock formations, eleven stock defenses, ten concepts, route/block/defense trees | Domain catalogues | 4.4 |
| Timing primitives (equal 10-yard stems + delayed jet) | `packages/test-fixtures/src/timing-primitives.ts` | 2.3 / 5.1 |

## Outputs

| Output | Original menu copy | Phase | Evidence now |
| --- | --- | --- | --- |
| Download PNG | DIAGRAM | 9.1 | Menu golden; file golden owed by 9.4 |
| Download SVG | DIAGRAM | 9.1 | Menu golden; file golden owed by 9.4 |
| Print the field | DIAGRAM | 9.4 | Print mode golden |
| Install page | TEACHING | 9.2 / 9.4 | Menu golden |
| Position view | TEACHING; Receivers / Backs / Line / QB / Defense | 9.2 | Position submenu golden |
| Quiz + answer key | TEACHING | 9.2 / 9.4 | Menu golden |
| Slide — 1920×1080 | TEACHING | 9.2 / 9.4 | Menu golden |
| Progression strip — 4 frames | TEACHING | 9.2 / 9.4 | Menu golden |
| Frame sequence — PNGs | TEACHING | 9.3 | Menu golden; 40-frame cap is finding #9 |
| Wristband — 8 cells | FIELD | 9.2 / 9.4 | Menu golden |
| Scout card — 4-up | FIELD | 9.2 / 9.4 | Menu golden |
| Practice cards — 2-up | FIELD | 9.2 / 9.4 | Menu golden |
| Call sheet | FIELD | 9.2 / 9.4 | Menu golden |
| Full playbook | BOOK | 9.2 / 9.4 | Menu golden; page-number drift is finding #12 |

Print-mode and Export-menu goldens are the Phase 0 visual lock. Generated-file goldens are Phase 9.4's job against these named originals.

## Viewports

| Viewport | States captured | Note |
| --- | --- | --- |
| 1440 × 960 | Every desktop mode, overlay, and selection | Primary desktop |
| iPad 834 × 1194 | Editor, Present, Print | Original still edits on tablet |
| Phone 390 × 844 | Editor | Original squeezes the editor; production phone is read-only (Phase 4.5 additive) |

## Football intelligence and library

Mapped in `docs/original-prototype-parity-matrix.md`. Formations, defenses, concepts, ball-on-hash, camera, palette verbs: Phase 4.4. Library, variations, scope, guarded play switch: Phase 6.1. Formation management and greedy role matching (finding #5) plus live-line `isLineman` (finding #11): Phase 6.2. Animation authoring and playback: Phase 5.

## Additive production extensions

IndexedDB, encrypted backups, Clerk, Convex, Conflict Inbox, R2, Share Links, PWA, observability: Phases 7–11. They must not rename, hide, or restyle an original control.
