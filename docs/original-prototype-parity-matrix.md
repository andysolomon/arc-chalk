# Original Chalk Prototype Parity Matrix

Status: governing inventory; item-level capture in progress
Canonical source: `Chalk Football Play Editor-2/Chalk Play Editor.dc.html`
Canonical runnable support: `Chalk Football Play Editor-2/support.js`
Decision: ADR 0039

## Rule

Every capability below is required in the deployable production app unless the product owner explicitly approves a change. Internal reimplementation is expected; to the Coach, the rebuild must be identical. Unapproved visual, textual, interaction, workflow, shortcut, touch, animation, or output divergence fails parity.

The one standing exception is the corrected-defect list immediately below. Those behaviors are approved divergences: reproducing them faithfully fails parity instead of satisfying it.

## Corrected expectations for documented prototype defects

The canonical prototype is the specification for what Chalk *does*, not for every way it currently fails. Seven defects in the original were verified against the running app and reproduced in a browser; the reviews in `docs/reviews/` carry the analysis and `file:line` anchors, and the fixes plus their 53 regression checks are preserved on the unmerged `fix/review-findings` branch as executable statements of the corrected behavior. That branch is not a merge candidate — the tracked prototype stays byte-identical to the archive — but its four test files are the behavior scripts this matrix's evidence section requires for these rows.

Where the corrected behavior is already delivered, the phase that delivered it is named. Where it is still open, the phase that owns it is named, and the correction is a requirement of that item rather than a follow-up.

| Defect | The original does | The production app must | Status |
|---|---|---|---|
| B1 — demo handoff overwrites the active Play (**Critical**) | Opening a demo into the editor leaves the previously open Play's identity attached, so the next Save rewrites and can rename unrelated work | Treat a demo handoff as a new unsaved Play with no prior identity; saving it creates a record and leaves the previously active Play unchanged | Corrected — Phase 4.1 Demo/Tour with EditorStore.adoptPlay (Phase 6.1 identity seam) |
| B2 — switching Plays discards unsaved work (**High**) | Opening another Play replaces the working document silently; the displaced work survives only in the in-memory undo stack until the tab reloads | Route every whole-document replacement through one guarded transition; unsaved work is never discarded without the Coach choosing to | Corrected — Phase 6.1 (`openStoredPlay`, refuse switch on local-save error, wait out the save queue) |
| #1 — coverage zones absent from every output (**High**) | Zones draw on the live canvas but never in export or print, so a Cover 3 prints as bare dashed lines and bubble markers | Zones render identically wherever the Play renders | Structurally prevented — Phases 2.3–2.4 project coverage areas from one `RenderScene`; Phase 9.4 owns the golden that proves it |
| #2 — saves fail silently while the UI says "Saved" (**High**) | A quota-exhausted write is swallowed and the button still turns green | Report the durable outcome truthfully and offer retry on failure | Corrected — Phase 3.2 |
| #3 — lateral yardage ~53% too large (**High**) | Horizontal distances are divided by the vertical scale, so every lateral readout and zone width overstates; 45-degree snapping is 45 degrees on screen, ~33 on the grass | Measure and snap in yard space on both axes; a snapped 45 is 45 on the grass | Corrected — Phase 2.2 for snapping, which chose grass-true breaks explicitly. The **conversion** into yard space had reproduced the same defect and was corrected separately; see below |
| #4 — live text and drag edits bypass commit (**High**) | In-progress typing and pointer movement write the document without marking it unsaved, so the status bar lies and the history timer can produce zero snapshots across a long session | Separate transient gesture state from committed state; every completed gesture is exactly one commit and one undo entry, and save state is always truthful | Corrected — Phases 3.2 and 3.3 |
| B3 — an intentional clear is auto-undone on reload (**Medium-High**) | Startup treats any empty document as lost work and force-replaces it from history | Auto-recover only unparseable storage; a structurally valid document — including a deliberately empty one — is preserved, and recovery is offered rather than forced | Corrected — Phase 3.4 |

### A corrected defect can still be reproduced downstream

Finding #3 was corrected in the geometry seam and then reproduced in the conversion that feeds it. `legacyCanvasToYards` read both axes on the depth scale, so every lateral coordinate it produced was 1.525 times too large, and the seeded `Stick — Thunder` carried that into its stored yards — the split end stood five yards out of bounds. A second defect hid it: field markings were drawn on a lateral scale the Players did not share, stretching the sidelines 177 pixels wider than the Play. The two errors differ by 1.3% and very nearly cancelled, so the Play looked correct until something moved.

Two lessons worth keeping:

- **A correction has to reach the data, not only the algorithm.** Phase 2.2's snapping was right the whole time; what was wrong was the Play it snapped.
- **Consistency assertions are not correctness assertions.** Checking that Players and markings agree passes while both are wrong. The guard that works pins the drawn field to its frame — an absolute, not a relationship.

The parity ratchets in `tests/parity/production-shell.spec.ts` rose 0.01–0.08 percentage points when this was fixed, because those goldens are captured from the uncorrected original. That rise is approved under this section rather than treated as a regression: matching the original here would be bug-compatibility, not parity.

The remaining reviewed findings (#5–#13, B4–B7) are not yet triaged into phases. They are defects in the original, not parity requirements; none should be reproduced deliberately, and each needs a decision before its owning phase closes.

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
