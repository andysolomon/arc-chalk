---
status: accepted
---

# Document-bound Unit · Type classification in the header (parity exception to ADR 0039)

ADR 0039 requires the production app to match the original prototype's Coach-facing
workflow. The original's header carries a flat category `<select>` — Pass, Run, RPO,
Screen, Defense, Special — seeded with **Pass** and bound to nothing. It reads the same
whatever Play is open, so a Coach who opens **Cover 3 — Fire Zone** sees **Pass**, and
choosing an option changes the control without changing the Play. The list also mixes
whole units (Defense, Special) with offensive sub-types, while the domain already
distinguishes Unit from Play Type (CONTEXT.md; `packages/domain/src/classifications.ts`).

Product decision (GitHub #63, 2026-09-13): the header control must tell the truth about
the open Play. That is a verified defect fix and a small, explicit divergence from the
original's chrome, recorded here as a standing parity exception.

## Decision

The header pill reads the open Play's classification and shows it as **Unit · Type** —
`Defense · Coverage`, or `Defense` alone when no Type is chosen. It keeps the original's
pill geometry, hairline, blue dot, Geist type, and header position.

- Opening the pill offers the three Units and, beneath them, only the live Types the
  Playbook defines for the Play's Unit, plus an explicit **Unclassified** choice. A Play
  never needs a Type below its Unit, and the pill never shows a default it does not hold.
- Changing the Type applies a `set-play-type` command. Changing the Unit applies a
  `set-unit` command. Both take part in undo/redo, continuous local save, search
  projections, and every print or export that names a category.
- Changing the Unit reconciles references explicitly. A Type, Concept link, or Formation
  link that belongs to the old Unit cannot stay — the Playbook envelope refuses the
  mismatch — so the pill names exactly what would be dropped and waits for the Coach to
  confirm. The confirmed change is one batch command and one undo step. The diagram
  (players, routes, labels, assignments) is never touched by classification.
- A Coach can define a Type of his own for the current Unit from the same pill. It is
  stored in the Playbook's existing `playTypes` definition model beside the built-ins;
  archiving retires a Type from the choices without reclassifying Plays that carry it.
- Legacy `Defense` and `Special` categories migrate to their Unit with no Type. Chalk does
  not guess whether an old Defense play was a Coverage or a Pressure.

## One vocabulary

`formatClassification` in `packages/domain/src/play-classification.ts` is the single
source of the words. The header pill, the Playbook browser cards and chips, the call
sheet's fallback group, the install page, practice cards, quiz, slide, and the field
print all read it. A call sheet no longer files an untagged defensive play under
**Other**; it lands under `Defense · Coverage` or `Defense`.

In the browser, **Defense** is a Unit chip and **Coverage** / **Pressure** are Type chips
inside it: Defense finds every defensive Play, classified or not; Coverage narrows within
it. Neither is inferred from the presence of defensive players on the field.

## Consequences

- The `<select>` and its six-option list are gone; the pill is a button that opens a
  panel in the established menu style. This is the only header chrome that changes.
- `playCategory` in `@chalk/exports` now returns the Unit · Type words, so printed
  footers read `Stick — Thunder · Offense · Pass` rather than `Stick — Thunder · Pass`.
- Recorded in `docs/original-prototype-parity-matrix.md` as an approved exception.
- Regression coverage: `tests/domain/play-classification.test.ts`,
  `apps/web/src/components/chalk-app.test.tsx` (Play classification), and the
  end-to-end reload check in `tests/e2e/editor-shell.spec.ts`.
