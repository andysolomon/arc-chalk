---
status: accepted
---

# Versions, not Save

ADR 0012 saves every edit to the device as it is made, and says the editor
offers explicit version actions "instead of an ambiguous durability-oriented
Save button". Parity work (ADR 0039) brought one back anyway. The header kept
the original's filled black **Save**, and its menu opened with a **Save ⌘S**
row. That row committed a play name the Coach had typed but not yet confirmed,
which blur and Enter already do, then showed "Saved" for a second. Coaches
read it as the thing that keeps their work, and it did nothing.

## Decision

**The header button is Versions.** It is a quiet menu button like Print &
export, not a filled primary action, because opening it commits nothing.
The menu holds only what makes something new:

- **Save as variant**: another version of the concept, as a new library row.
- **Snapshot**: a named state in History, with no new library row.
- The Play's named versions, each with **Restore**.

The **Save** row, the palette's **Save play** command and the sidebar's
"Saved" flash are gone. ⌘S still opens the menu. The save-state indicator in
the status bar stays the one report that a write failed (issue #97).

## Consequences

- This is a product-owner exception to ADR 0039. The ratchets in
  `tests/parity/production-shell.spec.ts` for Editor, More, Export, Versions,
  palette and shortcuts are raised to their branch measurement, about 1,400 px
  each (2,080 px for the menu itself). Formations and Defenses stay inside
  theirs.
- Copy that pointed at Save now points at Versions or says the play saves
  itself.
- `tests/e2e/versions-menu.spec.ts` checks that nothing in the header,
  the menu or the palette offers Save. It saves `versions-menu.png`.
