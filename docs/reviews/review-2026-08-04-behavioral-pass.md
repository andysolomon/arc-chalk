# Behavioral Review — Chalk Football Play Editor

**Date:** 2026-08-04
**Scope:** State transitions, persistence, recovery, packaged delivery, pointer input and keyboard access.
**Method:** As stated by the reviewer — an isolated Chromium behavioral pass at 1440×900, exercising persistence, dirty state, recovery, play switching and the guided-demo handoff.
**Source:** `Chalk Football Play Editor-2.zip` (dated 2026-08-02 19:11), extracted to the repo root. `Chalk Play Editor.dc.html` — 6,482 lines.
**Reviewer:** *unattributed — fill in.*

> **Provenance note.** This content was added to `review-2026-08-04-chalk-play-editor.md` at 2026-08-04 12:35, after that review was written, and has been split out here so the two evidence bases stay distinct. The author of this pass is not recorded and the runtime reproductions below have not been independently re-run.
>
> Three of its **code** claims were spot-checked against the extracted file and all three hold:
> - `support.js:1143–1147` does load React, ReactDOM and Babel from unpkg → **B5 confirmed**
> - `demoLoadPlay` (`:3687–3691`) sets `doc`, `playName` and `cat` but never touches `curPlayId` → **B1 confirmed**
> - `clearAll` (`:3171`) commits a valid empty document after snapshotting → **B3's premise confirmed**
>
> The sentences beginning "This was confirmed behaviorally" / "This was reproduced" describe runtime observations that have not been re-verified. Treat the static code claims as checked and the runtime claims as unverified until someone re-runs them.

---

## Priority summary

| # | Finding | Severity | Est. effort |
|---|---|---|---|
| B1 | Opening a demo can overwrite the active library play | **Critical** | S |
| B2 | Switching library plays replaces unsaved work without a guard | **High** | M |
| B3 | An intentional clear is automatically undone on reload | **Medium-High** | S |
| B4 | A named snapshot can be relabeled "Autosave" | **Medium** | XS |
| B5 | The packaged app cannot start offline | **Medium** | S |
| B6 | Touch gestures and object context actions are incomplete | **Medium** | M |
| B7 | Core library and picker rows are not keyboard-operable | **Medium** | M |

---

## B1. Opening a demo can overwrite the active library play — **Critical**

`demoLoadPlay` (`:3687–3691`) replaces `doc`, `playName` and `cat`, but leaves `curPlayId` pointing at the library record that was open before entering the demo. The next Save enters `savePlay`, which resolves a record by `curPlayId` before it considers the new play name (`:4282–4286`). That rewrites the previously open record with the demo document and may rename it as well.

This is the most direct destructive path in the app: the user follows the intended **Demo → Open this play in the editor → Save** flow and can overwrite unrelated work without a warning.

**Fix:** treat a demo handoff exactly like New. Set `curPlayId:null`, `dirty:true`, clear selection/editor transients, and autosave the demo as an unsaved working document. Add a regression test proving that saving a demo creates a new record and leaves the previously active record byte-for-byte unchanged.

---

## B2. Switching library plays replaces unsaved work without a guard — **High**

`loadPlay` (`:4436–4446`) immediately replaces the working document with the library copy and sets `dirty:false`. It does not save the current play, create a history snapshot, preserve a per-play draft, or ask the user what to do.

The displaced document is pushed onto the in-memory undo stack, so it may be recoverable through multiple Undo operations during the same tab session. That is too fragile to count as protection: loading another play again obscures the recovery path, and reloading the tab destroys the undo stack. The single `current.v1` autosave is also overwritten by the newly opened play.

*Reported as confirmed behaviorally: a committed unsaved label existed immediately before switching, but was absent after opening another play and returning to the original. Not independently re-run.*

**Fix:** add one centralized `beforeDocumentTransition` guard and route library open, New, demo handoff and other whole-document replacements through it. Near-term, offer **Save / Discard / Cancel** when `dirty`. The more durable design is a `fpd.drafts.v1` map keyed by play ID, so switching is instant and each play retains its own working draft until explicitly saved or discarded.

---

## B3. An intentional clear is automatically undone on reload — **Medium-High**

`clearAll` snapshots the pre-clear document and commits a valid empty document (`:3171`). Startup then classifies any restored document with no players and no routes as lost work (`:1298–1307`) and automatically replaces it with the newest history entry.

*Reported as reproduced: immediately after Clear the document had 0 players and 0 routes; after reload it had 11 players and 5 routes and displayed the recovery state. Not independently re-run.* New/blank documents are valid product states, so emptiness alone cannot be treated as corruption.

**Fix:** only auto-recover malformed/unparseable storage. Persist an explicit intentional-empty marker for Clear and New, or show a non-destructive **Restore previous version** bar while leaving the empty document in place. Recovery should be offered, not forced, whenever the stored document is structurally valid.

---

## B4. A named snapshot can be relabeled "Autosave" — **Medium**

When a snapshot's document matches the newest history document, `snapshot` replaces its label with every truthy incoming label (`:1394–1404`). The timer calls `snapshot('Autosave')`, so a manually named snapshot of an unchanged dirty document can lose its useful name 90 seconds later. This contradicts the adjacent comment that says the better name is kept.

**Fix:** assign label priority. A simple rule is enough: an incoming `Autosave` may refresh `at`, but must not replace any non-`Autosave` label. Explicit labels such as Saved, Before clearing and user-entered snapshot names may replace Autosave.

---

## B5. The packaged app cannot start offline — **Medium**

The ZIP looks self-contained, but `support.js` loads React 18.3.1 and ReactDOM 18.3.1 from unpkg during boot (`support.js:1142–1148`, `:1838–1846`). Google Fonts is also remote, though the app has local font fallbacks. Without network access, or under a Content Security Policy that blocks unpkg, the runtime never mounts and the editor is unusable.

**Fix:** vendor the pinned React UMD assets beside `support.js`, or embed them in the distributed runtime. Keep the SRI-pinned CDN path only as a development fallback. Add an offline smoke test that blocks every network request and asserts that the editor still mounts.

> Caveat for triage: `support.js` is a **generated** `dc-runtime` build marked "do not edit". The fix likely belongs in the runtime's build configuration or in how the ZIP is packaged, not in the app source.

---

## B6. Touch gestures and object context actions are incomplete — **Medium**

The canvas background registers pointers with `trackPtr` before attempting a two-pointer gesture (`:1897–1903`), but player and route pointer-down handlers stop propagation and do not register their pointers (`:1977–2006`). A pinch that begins on a player or route therefore starts an object drag instead of reliably becoming a camera gesture — a common case on a dense football diagram.

Labels are further behind: `onLabelDown` (`:2008–2013`) does not call `notePtr`, `palmReject` or `startPress`, and label render nodes do not define the right-click context handler used by players and routes. A palm can move a label during pen input, and labels cannot open the advertised long-press/right-click object menu.

**Fix:** route every object pointer down through one shared pointer preflight that records the pointer, applies palm rejection and starts long-press tracking before dispatching to object-specific behavior. Add labels to the same context-menu path. Validate on iPadOS Safari with finger-only, Pencil-plus-palm and two-finger gestures; desktop emulation is not sufficient for this feature.

---

## B7. Core library and picker rows are not keyboard-operable — **Medium**

Library concept rows (`:737`), defense cards (`:1023`) and formation cards (`:1109`) are clickable `div` elements without `tabindex`, keyboard handlers or button semantics. They appear as generic nodes in the accessibility tree, so keyboard and switch-control users cannot perform the primary open/apply actions. The nested favorite/delete buttons also make the click ownership ambiguous.

**Fix:** use actual `button` elements for the primary cards/rows where possible. If the custom layout requires a non-button container, add `role="button"`, `tabindex="0"`, Enter/Space handling, a visible focus treatment and explicit event propagation for nested actions. Give overlays `role="dialog"`, an accessible name, focus containment and focus restoration.

---

## Minimum regression suite

Proposed by this reviewer. The single-file constraint does not prevent automated tests. A small Playwright suite should cover:

- Demo → Open in editor → Save creates a new play and does not modify the prior record.
- Editing, dragging and route-node changes set dirty, create one undo entry per interaction and survive reload.
- Opening another play with unsaved work cannot silently discard it.
- Clear and New remain empty after reload; malformed JSON offers recovery.
- A named snapshot remains named after the autosave interval.
- Quota/write failure never produces a green Saved state.
- Cover 3 zone areas appear in SVG, PNG and print-derived SVG output.
- Lateral and vertical measurements both report known real-yard distances.
- The app mounts with all external network requests blocked.
- Library rows, formation cards, defense cards and dialogs are usable using only the keyboard.
