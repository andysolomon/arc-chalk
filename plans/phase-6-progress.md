# Phase 6 — progress

Status: **6.1 and 6.2 built; 6.3 mechanics built, name not chosen.**

Target file: `Chalk Play Editor.dc.html`.

## Landed

**6.3 mechanics (done first — everything else writes through these)**
- `PRODUCT = { name, mark }` on the logic class. Read by the header, `printDoc`
  (title suffix + repeating `.__pf` page footer), the frame-sequence manifest, and
  `setDocTitle()` which runs on mount and on every autosave.
- `NS = 'fpd.'` + `K(name)` — all 18 localStorage sites now go through it.
  `OLD_NS` (currently null) + `OWNED` + `migrateKeys()` runs first in `componentDidMount`:
  copies old→new only when the new key is absent, leaves originals alone.
  **To rename storage: set `OLD_NS='fpd.'` and `NS='<new>.'`.**

**6.1 version history**
- `fpd.history.v1` — map of playKey → array of `{at,label,doc,name}`. `HIST_MAX` 20 per
  play, `HIST_TOTAL` 60 across all plays (other plays get trimmed first, never the open one).
  `writeHistory` catches quota, halves every list, retries once.
- `snapshot(label)` skips empty docs and collapses a repeat of the identical doc into the
  existing top entry (keeping the better label).
- `HIST_EVERY` 90s interval, only when `state.dirty`. `commit(doc, extra, label)` takes an
  optional label — wired to formation apply, mirror, clear (snapshots *before* clearing),
  and save.
- History panel sits under Library in the right rail, collapsed by default. 30px rows,
  11px mono timestamp, 12px label, `Restore` in #0072F5.
- `restoreSnap(i)` pushes the current doc onto undo first, so Restore is undoable.
- Recovery bar above the canvas when the autosave is unparseable or empty while history
  has something — restores the newest snapshot and says how old it is.
- ⌘S on a play already in the library opens Save · Save as variant · Snapshot;
  ⌘S on an unsaved play just saves. Snapshot takes a typed label, no library row.

**6.2 input**
- `ptrs` map + `gesture`: two non-mouse pointers pinch-zoom around their midpoint and
  two-finger pan; a gesture never starts while a route is being drawn, and starting one
  reverts an in-progress object drag.
- `onWheel`: shift-wheel and horizontal wheel pan; plain wheel still zooms to cursor.
- `hitTol()` — pen 5px, mouse 10px, touch 16px; scales the invisible route hit strokes.
  `state.ptrType` updates on each pointer event.
- Palm rejection: a `touch` pointer within 900ms of pen activity is dropped, on the canvas
  and on player/route handlers.
- Long-press (480ms, 6px slop, touch/pen only) and right-click both open a context menu:
  Duplicate · Mirror · Bring forward · Send back · Delete.
- `@media (pointer:coarse)` in `<helmet>` gives every button/select a 44px `::after`
  hit area without changing its visual size.

## Open

- **The name.** Five candidates proposed in chat; nothing renamed. When the user picks:
  change `PRODUCT.name`, set `OLD_NS`/`NS`, and check header + a PNG + a printed footer.
- Not yet exercised on real hardware: pinch/palm behaviour is written against the pointer
  spec but has only been checked in a desktop browser.
