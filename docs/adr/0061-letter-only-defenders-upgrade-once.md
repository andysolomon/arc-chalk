---
status: accepted
---

# Letter-only defenders saved before #131 are upgraded once per device

#131 changed how a stock defensive call puts its men on the field: each defender is a
triangle with his letter inside, not a bare letter. It changed the catalogue, not the
Plays a Coach already had. A defense placed before v1.74.0 is stored with
`symbol: "none"` on every defender, and the editor draws what is stored, so those Plays
still show bare letters next to Plays drawn since. _Letter only_ is still a choice in the
inspector, so the renderer cannot tell a defender saved by an older release from one a
Coach set to a bare letter on purpose.

Product decision (2026-09-26): a Play saved before #131 should read like one drawn today.

## Decision

**Once per device, on launch.** `upgradeLetterOnlyDefenders` in `@chalk/local-db` runs
at startup right after `upgradeStoredPlays`. It rewrites every stored Play, in the
Trash too, whose defense has a letter-only man, drawing those men as triangles
(`drawLetterOnlyDefendersAsTriangles` in `@chalk/domain`). Offensive men are left alone.
It then records `upgrade.defendersAsTriangles` in the device's preferences, in the same
transaction as the rewrites, and never runs again. From then on, _Letter only_ on a
defender sticks.

**Not a schema version.** Bumping the Play `schemaVersion` would rehash every Play, not
only the ones with letter-only defenders. Prepared game plans hold each Play's hash, so
they would report every Play as changed. Share publications and game-plan revisions
would each need their own migration too. This change is cosmetic and applies to one
field of some Plays, so the upgrade touches only those Plays.

**Frozen copies keep what they froze.** Named versions, prepared game-plan revisions
and published share links are left as they were saved. Undo history recorded before the
upgrade no longer matches the upgraded Play's hash, and is quarantined as ADR 0038
allows for a migration.

**No sync push.** The upgrade queues no sync mutation, like `upgradeStoredPlays`. The
server raises a conflict whenever a push is not based on the cloud head, so two devices
each pushing the same upgrade would give the Coach a conflict over nothing. The cloud
copy picks up the triangles with the Coach's next edit, which pushes the whole Play.
Until then, a device that pulls the Play for the first time after its own upgrade has
run keeps the letter-only defenders it pulled.

**Guarded like the schema upgrade.** A Play another tab changed between the read and
the write is skipped. A Play that no longer matches its stored hash is left for
`getPlay` to report, rather than stopping the editor from opening.

## Consequences

- Restoring a backup exported before #131 on a device that has already upgraded brings
  its Plays back with letter-only defenders. The Coach re-picks the call or the symbol.
- A defender a Coach set to _Letter only_ between v1.74.0 and this upgrade becomes a
  triangle on the next launch. Before #131, letter-only was the default for every
  defense Chalk placed, so almost every such defender just predates the change.
- `tests/e2e/defender-triangles.spec.ts` proves the upgrade end to end: a Play
  saved with letter-only defenders is upgraded on launch, and a later _Letter only_
  survives the next one. `tests/local-db/letter-only-defenders-upgrade.test.ts`
  covers the failure modes a browser cannot practically reach.
