# Code Review — Chalk Football Play Editor

**Date:** 2026-08-04
**Scope:** `Chalk Play Editor.dc.html` (6,482 lines), full manual read. `support.js` consulted for runtime semantics only — it is a generated `dc-runtime` build and is explicitly out of scope. Phase plans in `plans/` read as the stated contract.
**Method:** Static review — line-by-line read of the whole file, with each suspected defect confirmed by targeted search. **No application was run and no browser pass was performed.** No code was changed.
**Source:** `Chalk Football Play Editor-2.zip` (17,360,265 bytes, dated 2026-08-02 19:11), extracted to the repo root. `Chalk Play Editor.dc.html` — 449,508 bytes, 6,482 lines.
**Reviewer:** Claude Opus 5.
**Line numbers** below refer to that file and were re-verified against it after extraction.

> Runtime/state-transition findings for the same build live in [review-2026-08-04-behavioral-pass.md](review-2026-08-04-behavioral-pass.md) (findings B1–B7). They are a separate pass by a different reviewer and are kept separate deliberately — see that file's provenance note.

---

## Priority summary

| # | Finding | Severity | Est. effort |
|---|---|---|---|
| 1 | Coverage zones missing from every export/print path | **High** | S |
| 2 | Saves can fail silently while the UI says "Saved" | **High** | S |
| 3 | Lateral yardage readouts are ~53% too large (two-scale field) | **High** | M |
| 4 | Live text and drag edits bypass `commit`, so `dirty` may never set | **High** | S |
| 5 | Formation role matching is first-match, not best-match | **Medium** | M |
| 6 | Animation speed depends on route angle | **Medium** | S |
| 7 | Shortcut panel advertises `1–9` read order, which isn't implemented | **Medium** | S |
| 8 | `insertDefense` deletes offensive labels by heuristic | **Medium** | XS |
| 9 | `exportFrames` silently caps at 40 frames; serial downloads get blocked | **Medium** | M |
| 10 | Blocked popups make every print path fail silently | **Low-Medium** | XS |
| 11 | `isLineman` hardcodes the line depth | **Low-Medium** | S |
| 12 | `printPlaybook` page numbers drift past ~30 plays | **Low** | XS |
| 13 | Full-document clone on every `pointermove` | **Low** (perf) | M |

---

## Overall assessment

This is genuinely good work, and the parts that are hard to get right are the parts that are right.

- **The document model is clean and consistent.** `state.doc = {players, routes, labels}` with routes carrying `points`, `branches`, `zone`, `assignment`, `conv`, `note`, `progression`, `preset`, `rule` is the correct shape for the domain, and nothing in the file quietly stores play data anywhere else.
- **Undo discipline is better than most drawing apps.** `commit(doc, extra, label)` as the single mutation path, `beginEdit()` / `endEditNow()` to batch typing bursts into one undo entry, and library changes riding the same stack as `{__lib}` entries — that last one in particular is a detail most editors get wrong.
- **The domain modelling is the real differentiator.** Formations carry roles; concepts are role → assignment distributions; propagation matches by role rather than by array index. That is what makes this a football tool rather than a vector editor with a green background.
- **The comments explain intent, not mechanics.** Rare and worth keeping.
- **The project's own constraints are being honoured** — single file, no build step, no npm imports, no `.jsx`. Phases 1–3, 5 and 6 do look landed.

The findings below are ordered by how much they would hurt a coach using this on a Friday night.

---

## 1. Coverage zones don't exist in any export — **High**

`zoneOf()` is called at three sites: the demo renderer (`:3721`), the live canvas (`:4846`) and the handle layer (`:4930`). It is **never** called from `exportSvgBody` (`:5014–5121`).

Every paper and pixel output routes through `exportSvgBody` via `exportSvgString` → `withFlat` — PNG, SVG, `exportPdf`, the install page, the playbook, scout cards, wristband, slide, and the progression strip. So a Cover 3 that reads correctly on screen prints as bare dashed lines and bubble markers with no coverage areas at all.

Given that phase 4 (coaching outputs) is the open objective and the scout card is explicitly a *defensive* output, this is the highest-value single fix in the file.

**Fix:** port the `zn` / `zn.sized` ellipse block from `buildCanvas` (`:4846`) into `exportSvgBody`, emitted *before* the route paths so it sits underneath them, matching on-screen z-order.

---

## 2. Saving can fail silently — **High**

`writeLib` (`:4116–4119`):

```js
this.setState(...);
try { localStorage.setItem(this.K('plays.v1'), JSON.stringify(list)); } catch(e) {}
```

The `catch` swallows. `savePlay` (`:4313`) then sets `savedFlash:true` unconditionally, so the button turns green and reads **Saved**. `autosave` (`:1371`) has the same shape.

This is not theoretical. `history.v1` holds up to 60 full documents (`HIST_TOTAL`) and is written every 90 seconds (`HIST_EVERY`). `writeHistory` (`:1383–1393`) has a decent halving fallback — but only for when *history itself* fails to write. Once history has consumed the quota, `plays.v1` writes start throwing too, and the coach who just spent an hour on a play gets a green checkmark and nothing on disk.

**Fix:** have `writeLib` return a boolean; on `false`, show a red/error state instead of "Saved", and offer the same halving eviction that `writeHistory` already implements. A one-line quota check on load would also let you warn before the cliff rather than at it.

---

## 3. The field has two scales, and four places assume it has one — **High**

`PPX = 976/(160/3)` ≈ **18.3 units per yard across** (`:1258`); `FIELD.ppy = 12` **units per yard deep** (`:1256`). That 1.53× stretch is a defensible drawing choice — it's what lets you show ~36 yards of depth in a readable frame. The problem is that several call sites divide *horizontal* distances by `ppy`.

- **`readoutFor` (`:1799`)** — `const lat = Math.abs(q.x - origin.x) / this.FIELD.ppy;`
  The built-in `out` preset breaks 88 units sideways, which is 4.8 real yards. The readout says **7.5 out**. Every lateral number the app displays while dragging is ~53% too large. For a tool whose entire value proposition is being trusted about distances, this is the worst-feeling bug in the file even though it's not the most damaging.

- **Zone width readout (`:2159`)** —
  ```js
  this._readout = { x:c.x, y:c.y - r.zone.ry - 10,
    text: this.fmtYd(this.pxToYdSpan ? this.pxToYdSpan(r.zone.rx*2) : r.zone.rx*2/12) + ' yds wide' };
  ```
  `pxToYdSpan` **does not exist anywhere in the file** — confirmed by search. The guard means the `/12` fallback is the only branch that ever runs, so zone widths are wrong by the same factor. The dead guard also reads like the correct fix was started and never finished.

- **`applySnap` (`:1752`)** — 45° snapping is 45° *on screen*, which is ~33° on the grass. Arguably intended, but it should be a decision rather than a side effect. A coach drawing a "45" gets an angle that isn't one.

**Fix:** add `xToYd` / `ydToX` next to the existing `depthYd` / `yToPx`, and convert per axis at each site. Then decide explicitly whether snapping is visual or geometric and comment the choice.

---

## 4. `dirty` is not set for live text or drag edits — **High**

`editPlayer` (`:2325–2336`), `editLabel` (`:2335`), `editRoute` (`:2357–2366`) and `setNodeDepth` (`:2377–2386`) all end in `this.setState({doc:d})` directly. Dragging has the same gap: `updateDrag` writes the changed document during pointer movement (`:2169`), then `onSvgUp` records undo and autosaves (`:2198–2200`) without ever setting `dirty:true`. `plans/README.md` says, in its own words:

> **Mutation discipline.** Every document change goes through `this.commit(doc, extra)` … Never `setState({doc})` directly.

Two concrete consequences:

1. The status bar (`:6195`) keeps reading **saved** while there are unsaved assignments, notes, conversions and labels.
2. The 90-second history timer (`:1339`) is gated on `state.dirty`, so a long session of typing assignments or repositioning objects can produce **zero** snapshots — precisely the work version history exists to protect.

They can't simply call `commit` — that would break the one-undo-per-typing-burst behaviour that `beginEdit` was written to provide. But they must set `dirty:true` alongside `doc`.

**Fix:** add a small `liveEdit(d)` helper that sets `{doc:d, dirty:true}` without creating an undo entry, and use it for every in-progress text and pointer mutation. The corresponding edit/pointer-end handlers should remain responsible for adding exactly one undo entry and autosaving. This preserves the current typing-burst and drag undo behavior while making status and history accurate.

---

## 5. Role matching is first-match, not best-match — **Medium**

`recognizeFormation` (`:3019–3026`) and `realignPlan` (`:3038–3043`) both walk the player list, take the **first** unused player whose role string matches, and `break`.

With two players sharing a role this is arbitrary. Gun Ace has `U` and `Y` both typed `TE`, and `rolesFor` additionally assigns `H` to every unclassified skill player, so collisions are common rather than exotic. Realigning into a formation where the U and Y sit on opposite sides can cross them over — the U runs to the Y's spot and drags his route with him.

`recognizeFormation` fails the same way with an extra sting: it marks a candidate `used` **even when the distance check fails**, so one bad early pairing burns the right player and drops confidence below the 0.85 threshold. The formation is silently not recognised.

**Fix (same for both):** build all `(source, candidate)` pairs of equal role, sort by distance ascending, and assign greedily, skipping pairs whose players are already taken. Twenty lines, and it makes the whole formation system feel deliberate rather than lucky.

---

## 6. Animation speed depends on route angle — **Medium**

`paceUnits()` (`:5135`):

```js
paceUnits(){ return (this.props.pace !== undefined ? this.props.pace : 8) * this.FIELD.ppy; }
```

Pace is applied as *drawing units* per second, but the drawing space is anisotropic (finding 3). So a player's apparent speed changes with his heading: a 10-yard vertical route takes 1.25s, a 10-yard horizontal one takes 1.9s. Jet motion is the most visible case, and it's in the flagship example play.

**Fix:** measure `atDist` / `geomFor` path length in yards (converting each axis) rather than in raw units, and let pace be yards per second as its name implies.

---

## 7. The shortcut panel advertises a shortcut that doesn't exist — **Medium**

`shortcutRows` (`:6022`) lists `['Read order on a route','1–9']`. `onKey` handles digits **only** inside `if(this.state.drawing)` (`:1862`). Outside drawing mode, digits do nothing; progression is settable only through the inspector field at `:6388`.

`plans/README.md`'s "**Bar for done.** Nothing ships that only looks right in a screenshot" applies to the shortcut sheet as much as to the canvas.

**Fix:** either wire `1–9` to set progression on the selected route, or delete the row. Wiring it is the better call — read order is exactly the thing you want to set fast while scanning a play.

---

## 8. `insertDefense` deletes offensive labels by heuristic — **Medium**

`:3339` removes any label that is blue, above `y=440`, and a single `[A-Z$]` character. The intent is to clear the previous defense's call letters, but the predicate doesn't check side — so a blue progression marker "H" sitting above the line vanishes when you drop in a defense.

The `l.side !== 'def'` filter already present at `:3359` does the intended job correctly. The heuristic is redundant risk on top of a correct filter.

**Fix:** delete the heuristic at `:3339` and rely on the side filter.

---

## 9. `exportFrames` caps silently and downloads serially — **Medium**

`:5414–5430`. The frame loop stops at `times.length < 40` with no notice to the user, while the manifest header prints the **full** clip duration — so a 6-second play produces a manifest claiming 6 seconds and a folder holding the first 40 frames of it.

It then fires up to 40 sequential `a.click()` downloads 260 ms apart. Chrome and Safari both block automatic multi-file downloads after the first few, so in practice the coach gets three or four PNGs and a permission bar.

**Fix:** state the cap in the manifest and in the UI, and deliver a single artifact — a sprite sheet, or a zip assembled in-memory. A sprite sheet fits the no-build-step constraint better.

---

## 10. Blocked popups fail silently across all print paths — **Low-Medium**

`printDoc` (`:3779–3780`) returns silently when `window.open` returns null. Nine print/export entry points funnel through it, so with a popup blocker on, every one of them does nothing and says nothing.

**Fix:** one `flashToast` on the null branch covers all nine.

---

## 11. `isLineman` hardcodes the line depth — **Low-Medium**

`:2813` — `Math.abs(p.y - 448) < 14`. Ball spotting, block presets, line calls, animation pace and role inference all route through this predicate, so any formation drawn with the line at a different depth quietly loses all of them at once. Nothing errors; the play just stops behaving like a play.

**Fix:** derive the line's y from the document (median y of the five interior players, or the formation's own record) rather than from a constant.

---

## 12. `printPlaybook` page numbering drifts — **Low**

`:4090` starts page numbers at 3, assuming a cover page plus exactly one contents page. Past roughly 30 plays the contents runs to two pages and every number printed in it is off by one.

**Fix:** compute the contents page count from the play count before numbering.

---

## 13. Performance: full-document clone per `pointermove` — **Low**

`updateDrag` (`:2111`) does `this.clone(g.startDoc)` — a full `JSON.parse(JSON.stringify(...))` of the document — on **every** pointermove, then `setState`, which reruns all ~950 lines of `renderVals` (`:5472`) and rebuilds the entire SVG node tree in `buildCanvas`. On a 22-player play that's tens of KB of JSON churn plus several hundred fresh closures per frame.

Nothing here is architecturally wrong and it's fine on a laptop. But if dragging ever feels sticky on an iPad, this is the reason.

**Fix (cheap wins, in order):**
1. Clone once at drag start into a working copy held on `this`, and mutate that per move instead of re-cloning.
2. Hoist the parts of `renderVals` that don't depend on selection — formation cards, defense cards, command palette, shortcut rows — behind a cache keyed on the inputs they actually read.

---

## Notes, not bugs

Worth knowing; none of these will bite a user today.

- **Three bounds for one field.** `IN.x1 = 984` (`:1749`), `pt()` clamps to 994 (`:1452`), `realignDoc` clamps to 994 (`:3061`). Harmless now — pick one and name it.
- **`state.marquee`** is written in `maybeStartGesture` (`:1502`) and read nowhere.
- **`_geo` cache (`:5168`)** is keyed by route id with no eviction, so it accumulates across every play loaded in a session. Small, but unbounded.
- **Two escape functions, both correct.** `escP` (`:3847`) doesn't escape quotes, but every one of its uses is element *content*; `exportSvgBody`'s local `esc` (`:5016`) does escape them and is used in attributes. This is right as written — add a comment so nobody "simplifies" them into one function and introduces an injection path through play names.
- **Overlay accessibility.** No `role="dialog"` or focus trap on the formation picker, defense picker, command palette or shortcuts overlay. Escape works; focus doesn't return to the trigger.

---

## If you only do three things

1. **Missing zones in export (#1)** — it breaks the phase-4 outputs you're about to build on top of, so fixing it first avoids building on sand.
2. **Silent save failure (#2)** — the one failure mode that loses a coach's work with no warning.
3. **Lateral yardage (#3)** — it makes the app lie about numbers, which is the single thing a coaching tool cannot do.

**And one for feel:** the role-matching fix (#5) is the change that most improves how the formation system behaves in daily use.

> Cross-review sequencing that accounts for the behavioral findings too lives in [README.md](README.md).
