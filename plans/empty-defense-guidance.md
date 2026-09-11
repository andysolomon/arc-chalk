# Empty defense guidance

Read `plans/README.md` shared voice rules and `docs/empty-defense-guidance-IMPLEMENTATION_PLAN.md`
for the full plan. This file is the short handoff prompt.

## Problem

Offense-only Plays leave a blank defensive half. Coaches know Cover 3 / Nickel / Fire Zone,
but not that **No defense yet** (or `⇧⌘D`) is the intended first move. Freehand Letter + `Z`
is the expert path, not the natural first path.

## Decision

- **A — field CTA** locked (2026-09-11)
- Linear: [ARC-182](https://linear.app/arcnology/issue/ARC-182/w-000089-add-a-field-cta-on-empty-defensive-half-to-open-defenses) / W-000089

## Do

1. Record an ADR 0039 parity exception before shipping chrome.
2. Add a pure show/hide helper + tests.
3. Wire Option A field CTA to the existing Defenses overlay — do not auto-apply a call.
4. Keep offense, apply semantics, and shortcuts unchanged.

## Do not

- Redesign the Defenses browser or catalogue
- Auto-drop a default defense
- Add Madden-style zone art or play-card chrome
- Restyle unrelated Editor surfaces

## Done when

From an offense-only Play, a Coach can open Defenses in one obvious action; after a call
lands, the empty guidance is gone; tests and a walkthrough prove it.
