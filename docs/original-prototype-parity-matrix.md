# Original Chalk Prototype Parity Matrix

Status: governing inventory; item-level capture in progress
Canonical source: `Chalk Football Play Editor-2/Chalk Play Editor.dc.html`
Canonical runnable support: `Chalk Football Play Editor-2/support.js`
Decision: ADR 0039

## Rule

Every capability below is required in the deployable production app unless the product owner explicitly approves a change. Internal reimplementation is expected; to the Coach, the rebuild must be identical. Unapproved visual, textual, interaction, workflow, shortcut, touch, animation, or output divergence fails parity.

## Visual system and shell

- Chalk mark, header proportions, Geist/Geist Mono typography, monochrome palette, blue selection, semantic route colors, hairlines, control radii, compact density, hover/focus treatments, and coaching voice.
- Editor, Demo/Tour, Present, and Print views with their existing hierarchy and transitions.
- Editable Play title, category treatment, undo/redo, More, Export, and Save/version menus.
- Full-window field-first workspace with independently collapsible tool rail and inspector, Focus mode, persistent chrome state, status bar, and contextual help.
- Canvas camera behavior, zoom cluster, fit, fit-to-selection, persistent per-Play camera, minimap, and page/field presentation presets.

## Drawing and direct manipulation

- Player placement and editing, all existing symbols, fill modes, labels, sublabels, colors, sides, groups, and role behavior.
- Route creation and node editing; straight and curved segments; control handles; inserted nodes; segment selection; branches/choice routes; alternate routes; and route-to-player attachment.
- Route kinds and semantics including route, motion, block, zone, blitz, and stunt with their existing defaults.
- Line and segment styles, endings, block ticks, colors, read numbers, assignments, conversions, and coaching notes.
- Free labels, boxes, outlines, leaders, colors, collision handling, and annotation-layer visibility.
- Select, additive select, marquee, move, pan, zoom, pinch, two-finger pan, mirror, strength flip, copy/paste, delete, clear-by-layer, clear-side, and clear-all behavior.
- Yard-aware angle snapping, depth behavior, ball/hash placement, field landmarks, snap guides, and the snapping toggle.
- Right-click and long-press actions, command palette, shortcuts, guided hints, and status feedback.

## Football intelligence

- Built-in offensive Formation library with search, personnel/family grouping, favorites, custom Formations, structured roles, hash/ball metadata, and save-Formation behavior.
- Hover and pinned Formation previews, match hairlines, Apply/Cancel, all apply modes, role-aware realignment, route/label preservation, and one-step undo.
- Formation recognition, status naming, semantic counterpart strength flip, and geometric fallback.
- Built-in defensive fronts, coverages, and pressures with favorites, search, insertion, zone drops, blitz paths, and preservation of the opposite unit where intended.
- Ball hash selection, line calls, quick route presets, quick block presets, defensive presets, Concepts, route rules, and jet/motion rules.
- Flexible player counts for offense, defense, special teams, and drill cards.

## Play library and Concept families

- Save/update, new Play, guarded transitions, delete/confirm, rename, duplicate/variation, and current-Play identity.
- Concept-to-variation tree, persisted disclosure state, current marker, distinguishing variation names, and seeded examples.
- `This play`, `Whole concept`, and `Pick…` edit scopes with role-based propagation, visible scope markers, skip reporting, and undoable library changes.
- Detach-from-Concept behavior, Concept notes/tags, Formation-derived variation naming, and explicit alignment push.
- The current library panel remains available even if a season-scale Playbook browser is added.

## Workspace, teaching, and animation

- Coach, Player, and Print type presets; Reads, Assignments, Notes, and Text layers; minimum readable text; and label collision handling.
- Present mode with full-window field, hidden authoring chrome, variation stepping, and return-to-editor behavior.
- Print preview using the same renderer and page presets as output.
- Guided Demo/Tour sequences, examples, inspector teaching panels, playback, and stepping.
- Route delay, speed, and hold; pre-snap motion; constant-distance straight/curve movement; endpoint holds; defender movement; and ghost trails.
- Play, pause, reset, 0.5x/1x/2x speed, scrubbing, time/snap state, keyboard playback, and editability at frozen frames.
- Timing survives save, mirror, variation, Formation realignment, and restore.

## Exports and coaching outputs

- PNG, SVG, and Print the field.
- Practice cards, call sheet, install page, position view, quiz and answer key, presentation slide, wristband, scout card, progression strip, and full Playbook.
- Existing pickers, group fading, tag/category grouping, page sizes, typography, cut lines, assignment/progression content, layer settings, and print semantics.
- Frame-sequence animation export and manifest.
- Coverage zones, routes, branches, labels, player styling, and field geometry remain consistent across every renderer and document.

## Durability, recovery, and input

- Working-document persistence, explicit Play save/update, named snapshots, per-Play history, human labels, restore, recovery notice, and undoable restore.
- Undo/redo for document and scoped library changes, truthful dirty state, guarded transitions, and visible failure reporting.
- Mouse, keyboard, touch, trackpad, and stylus behavior including pinch, two-finger pan, long-press, precision tolerance, palm rejection, and coarse-pointer targets.
- Existing preferences, favorites, camera, library disclosure, layers, chrome, Formations, seeds, and Plays migrate without loss.

## Additive production extensions

IndexedDB repositories and migrations, persistent hash-guarded undo, encrypted backups, Clerk access, Convex replication, Conflict Inbox, private R2 images, external Film References, immutable Share Publications, scale search/virtualization, PWA installation, observability, backups, and isolated environments extend the original rather than replace it.

## Evidence required before parity can be claimed

- Screenshot baselines for every top-level mode, panel, menu, modal, selection state, and responsive state.
- A control/action inventory generated from source and manually verified in the running prototype.
- Complete shortcut and pointer/touch/stylus gesture maps.
- Serialized fixtures for every player, route, branch, label, Formation, defense, Concept family, timing, and output state.
- Golden samples for every export and printed document.
- Behavior scripts for all feature groups, including corrected expectations for documented prototype defects.
