---
status: accepted
---

# A Play remembers the set its shadow offense stands in (amends ADR 0053 and ADR 0055)

A Coach opened a saved defensive play — 4-3 Cover 3 — and put Gun Doubles Right under
it as the Shadow offense (issue #152). Twenty-two men stood on the field and the footer
read _Local save failed — retry_; hovering it showed a validation issue at
`plays[0].formationSource`: _Formation Gun Doubles Right belongs to offense, not
defense._ Every edit after that failed the same way, the only sign was two small red
words, and a reload threw away everything since the shadow went on — the name, the
shadow, the assignments. With no shadow to keep, a man call on a defensive play had no
receiver to match. The other way round — an offensive play with a shadow defense —
saved fine.

## Why it failed

ADR 0055 has a Play remember what each side of the ball was put in so the men can be put
back: `formationSource` for the offense, `defensiveCallSource` for the defense.
`applyDefensiveCall` records the call on whichever Play it is given, so on an offensive
play the shadow defense's call is remembered and its _Reset to_ row works. `applyFormation`
records the set the same way — but the Playbook validation, written when a Play could
still be reclassified across units (ADR 0041), demanded that the set's unit match the
Play's. Under ADR 0053 a Play's unit is fixed and the other side is a shadow, so that rule
no longer guards a reclassification; it forbids a defensive play from remembering its
shadow's set at all, and a set is the only thing an offense is ever put in. (A Playbook
of its own may still put a defensive play in a defensive set it owns, as the released
goldens do; that was never the failing case.)

## Decision

**`formationSource` is the set the Play's offense stands in — its own on an offensive
play, its shadow's on a defensive one — exactly as `defensiveCallSource` is the call its
defenders stand in on either.** The Playbook validation no longer demands that the set's
unit match the Play's; it refuses the one mismatch that is a mistake — a defensive set on
an offensive play, whose defense is a call and never a set. A defensive play may stand in
a defensive set its Playbook owns or in its shadow offense's. Nothing new goes in the
document, `applyFormation` is unchanged, and the shadow offense's _Reset to_ row
(ADR 0055) keeps the set it promised.

**The book does not file a defensive play under its shadow's set.** The search projection
leaves `formationId` empty for a defensive play, so the Playbook browser's Formation
filter and the Formations page's counts list the plays _in_ a set and never the plays
drawn against one. A defensive play's own alignment is its call.

**A failing save asks before the tab is left.** While the last local write failed, the
editor arms the browser's leave-this-page prompt, and the status's detail says what the
failure means in a coach's words — the latest edits are only on this screen; retry and
stay until it says _Saved_ — followed by what the device said. A refused Play's reasons
are given as the issues' own sentences, never as the JSON that carries them.

## Consequences

- A defensive play with a shadow offense validates, saves, and reloads with its name,
  its shadow, its assignments and its shadow's set; a man call on it has receivers to
  match.
- A backup, export or replica that already holds a defensive play with its shadow's set
  loads as it is: the source is kept, not dropped.
- `reclassifyPlay` still drops a set whose unit differs from the new one when a unit is
  changed in reconciliation. No control issues that command (ADR 0053), and dropping the
  set there is harmless.
- An unvalidated draft is not persisted for recovery after a reload; the prompt is what
  stands between a failing save and a lost edit. Persisting a draft the repository
  refused is left for a later decision.
- The regression is `tests/e2e/shadow-offense-save.spec.ts`, which saves the field of a
  Nickel Cover 1 against Gun Doubles Right after a reload and the screen while a save
  is failing.
