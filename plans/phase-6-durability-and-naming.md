# Phase 6 — Durability, input, and naming

Read `plans/README.md` first. This phase has no new features — it is the work that makes
the tool trustworthy enough to use on a Sunday night.

## 1. Version history

Today: one autosave slot (`fpd.current.v1`) and a 120-step in-memory undo that dies with
the tab. A coach who closes the tab after an accident has lost the play.

Build:

- **Rolling snapshots.** Every 90 seconds *and* on every named action (formation applied,
  mirror, clear, variant saved), push a snapshot into `fpd.history.v1` — a per-play ring
  buffer of 20, storing `{at, label, doc}`. Prune oldest first. Guard against
  `QuotaExceededError` by dropping the oldest half and retrying once.
- **History panel** in the library section, collapsed by default:
  ```
  History
  2 min ago    Applied Gun Trips Right      Restore
  6 min ago    Autosave                     Restore
  11 min ago   Mirrored the play            Restore
  ```
  Rows 30px, timestamp in 11px mono #8F8F8F, label 12px, `Restore` as a #0072F5 text
  button. Restoring pushes the current doc onto undo first — restoring is itself undoable.
- **Recovery on load.** If `fpd.current.v1` fails to parse, or its doc has zero players
  while history has a non-empty snapshot, show a one-line bar above the canvas: "Recovered
  your last play from 4 minutes ago. Undo to go back." Never silently open an empty field
  over someone's work.
- **Named snapshots.** `⌘S` on an already-saved play offers "Save · Save as variant ·
  Snapshot" — a snapshot is a history entry with a typed label and no library row.

## 2. Touch, trackpad, and stylus

Pointer events are already used, so the basics work. What is missing:

- **Pinch to zoom** — two-pointer gesture on the canvas maps to `zoomBy` with the midpoint
  as anchor. Two-finger drag pans.
- **Trackpad pan** — shift+wheel and two-finger horizontal wheel pan instead of zoom.
- **Stylus** — treat `pointerType === 'pen'` as precise: hit tolerance drops from 10px to
  5px, and `pressure` is ignored (route weight is a style choice, not an input artifact).
  Palm rejection: ignore `touch` pointers while a `pen` pointer is active.
- **Touch targets** — every control on a touch pointer gets a minimum 44px hit area via
  padding, without changing its visual size.
- **Long-press** on a player or route opens the same menu right-click opens.

## 3. The name

The product is called Chalk in the header, the storage keys, and the exports. CHLK is a
shipping football play-drawing app for iPad aimed at exactly these users. This is a
discovery and positioning problem regardless of any legal question, and it gets more
expensive to fix with every play a user saves.

Deliverable for this phase is not a decision — it is the mechanics that make the decision
cheap:

- Put the product name in **one** constant, `PRODUCT = { name, mark }`, and reference it
  from the header, exports, print footers, and document titles.
- Namespace storage keys behind one prefix constant (`fpd.`) with a migration helper that
  copies old keys to new on first load and leaves the originals untouched for one release.
- Then propose 5 candidate names with the reasoning in one line each: distinct in search,
  says football or drawing, one syllable or two, no vowel-dropping, available as a .com
  guess. Wait for the user to pick before renaming anything.

## Done when

- [ ] Killing the tab mid-edit and reopening restores the work, with a visible note saying so.
- [ ] History lists at least the last 20 states with human labels; Restore is undoable.
- [ ] Filling local storage does not lose the current play.
- [ ] Pinch zooms, two-finger drags pan, and neither fires while drawing a route.
- [ ] A stylus draws with 5px tolerance and a resting palm does not create a route.
- [ ] Every control is at least 44px to a finger.
- [ ] Renaming the product is a one-constant change, verified by changing it and checking
      the header, a PNG, and a printed footer.
