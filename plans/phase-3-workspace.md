# Phase 3 — Workspace

Read `plans/README.md` first. This phase touches layout and rendering only — no document
schema changes.

## The problem

The field lives in a centered card capped at 1160px with 20px padding, inside a fixed
56px tool rail and a fixed 292px inspector. It photographs beautifully and draws poorly:
at 1440px wide the actual field is under 1100px, and there is no way to give the canvas
the window without also losing the inspector (focus mode, `F`, hides both rails at once).
Label text near the line of scrimmage collides and drops below readable size.

## What to build

### 1. Canvas fills its column

Remove the max-width cap and the card treatment from the editing view. The canvas column
becomes the full remaining width with 1px hairline separators against the rails and a
#FFFFFF field on the #FAFAFA app background. Keep the card presentation **only** in the
new Presentation and Print-preview modes (below), where the paper edge is the point.

The field keeps its 1000×620 aspect internally; the camera (`state.cam`) already handles
letterboxing — extend `fitField()` to fit to the column's real aspect rather than
assuming 1000/620.

### 2. Panels collapse independently

- Inspector: a 20px collapse affordance on its inner edge; collapsed it becomes a 28px
  strip with a vertical `INSPECTOR` label in 10px mono, click to restore. `⌥1`.
- Tool rail: collapsible to 0 with the tools still reachable by their existing letter
  keys and the palette. `⌥2`.
- `F` keeps its current meaning (both at once) — it is now a shortcut for two states
  rather than its own mode.
- Persist both in `fpd.chrome.v1`.

### 3. Persistent zoom and a navigator

- Persist `cam` per play in the play record, so reopening a play returns to where the
  coach was working.
- Minimap: 132×82 at the bottom-right of the canvas, #FFFFFF at 92% opacity over a
  hairline, showing the whole field with players as 2px dots and the viewport as a
  #0072F5 1px rect. Drag the rect to pan, click anywhere to center. Auto-hides when the
  camera is at fit (nothing to navigate) with a 120ms fade.
- Add `Fit to selection` to the zoom cluster (the method `zoomToSel` exists; it needs a
  keyboard binding: `⌘2`).

### 4. Presentation and Print-preview modes

Add to the view tabs, which currently read Editor / Tour:

- **Present** — full-window field on #171717, no chrome, no handles, no snap guides. Type
  scales up one preset (below). `→`/`←` step through the current concept's variations.
  `Esc` returns to the editor.
- **Print preview** — the field on a letter sheet at true proportion, in the card
  treatment, with the current `pageKind` applied and margins drawn as hairlines. This is
  what `Export → Print` will produce, shown before producing it.

Both are read-only views of `state.doc`; they must not create a second render path — reuse
`buildCanvas` with a `mode` argument that switches handle/guide/chrome visibility.

### 5. Typography presets and label collision

Three presets, selectable in the Page section and carried into exports:

| Preset | Assignment / label | Read number | Notes |
|---|---|---|---|
| Coach | 12px | 13px | dense, everything shown |
| Player | 15px | 17px | assignments only, notes hidden |
| Print | 13px | 14px | pure black, no color fills |

Enforce a **minimum on-screen size of 11px after camera scale** — when zoomed out past
that, labels drop out entirely rather than becoming illegible mush, and the status bar
notes `labels hidden — zoom in`.

Collision avoidance: after layout, run one pass over all text nodes; where two boxes
overlap, push the lower-priority one along its route's normal by up to 14px, then fall
back to a 2px-padded #FFFFFF backing at 88% opacity. Priority order: read number >
assignment > conversion > coaching note > free text.

Annotation layers, as four toggles in the Page section: `Reads`, `Assignments`,
`Notes`, `Text`. Off-state hides that class of label everywhere including exports.

## Done when

- [x] At 1440px the drawable field is visibly wider than today's card.
- [x] Inspector and tool rail collapse independently and survive reload.
- [x] Minimap pans the camera and hides itself at fit.
- [x] Present mode fills the window with no handles and steps variations with arrows.
- [x] Print preview matches what Export → Print actually outputs.
- [x] Two labels that overlapped now don't, and neither renders below 11px on screen.
- [x] Turning off `Notes` removes notes from both canvas and PNG export.
