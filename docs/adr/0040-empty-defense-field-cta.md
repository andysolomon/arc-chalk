---
status: accepted
---

# Additive empty-defense field CTA (parity exception to ADR 0039)

ADR 0039 requires the production app to match the original prototype's Coach-facing
workflow. The original leaves an offense-only Play with a blank defensive half and no
field-local next action; the inspector control **No defense yet** and shortcut `⇧⌘D`
are the only entries into the Defenses browser.

Product decision (ARC-182 / W-000089, 2026-09-11): that silence is under-discoverable.
An **additive** empty-state control is approved as a standing parity exception.

## Decision

When the Editor shows at least one non-defense player and zero defense players, Chalk
may show a low-chroma **Add a defense** control on the empty defensive half. Activating
it opens the existing Defenses overlay — the same path as **No defense yet** / `⇧⌘D`.

## Consequences

- Additive chrome only: no Defenses browser redesign, no catalogue change, no auto-apply.
- Freehand Letter players and `Z` zone drops remain available; they stay the expert path.
- The control must not steal pan or marquee outside its own hit target.
- After any defense player is on the field (stock call or custom front), the control hides.
- The control is Editor-only; Demo, Present, and Print never show it.
- Recorded in `docs/original-prototype-parity-matrix.md` as an approved additive exception.
