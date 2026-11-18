---
status: accepted
---

# The shadow has one home in the sidebar (amends ADR 0053 and ADR 0077)

On a desktop the left column offered the shadow three times: the rail's shadow
button under Tools (_Add a shadow defense_, then _Shadow defense — H_), the
_Shadow defense_ row under This play, and a _Shadow defense_ switch in View &
library → Show on field. Each one showed and hid the same men. ADR 0074 says
every control has one home.

Product request (2026-11-16): the left sidebar needs one button for the Shadow
offense and one for the Shadow defense, not two of each.

## Decision

**The This play row is the shadow's home.** Its popover already does all three
jobs: Shown / Hidden, the other unit's browser (which adds the shadow when
nobody is there yet), and the Reset row.

**The rail beside the sidebar has no shadow button.** When the tools head the
sidebar, or the folded rail beside its icons (a desktop and an iPad in
landscape), the rail goes from Formation straight to the play call. A tablet
drawer and a phone's tool row keep the button (ADR 0077), because there the
sidebar is closed and the button is the only shadow control on screen.

**Show on field lists only the layers.** Reads, Assignments, Notes and Text are
the four switches; the shadow is no longer a fifth.

## Preserved

H still shows and hides the shadow. Picking a call on an offensive play, or a
formation on a defensive one, still shows a hidden shadow. `Presentation.hideShadow`
and its render are unchanged.

## Evidence

`tests/e2e/toolbar.spec.ts` checks that the rail beside the sidebar has no
shadow button, adds the shadow defense and the shadow offense from the Shadow
row's picker, and shows and hides the defense from its popover.
`tests/e2e/one-left-column.spec.ts` counts four layers under Show on field.
`tests/e2e/phone-toolbar.spec.ts` still adds the shadow from the phone's tool
row.
