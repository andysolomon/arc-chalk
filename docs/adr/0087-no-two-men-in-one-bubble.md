---
status: accepted
amends: 0075-the-defense-is-called-by-unit
---

# No two men stand in one bubble (amends ADR 0075)

ADR 0075 let men whose calls name the same ground share it: one bubble, a line from
each. Underneath, that took back ADR 0059's rule that stacked bubbles slide apart. Hooks
land on one of three spots (left, over the ball, right), so in Nickel Cover 2 a Mike and
a strong safety both called Hook end on the same spot. The field then draws one bubble
with two lines running into it, and two men are covering one piece of ground while the
ground next to it is open.

Product request (2026-11-16): the zones should be smart enough that two players never
occupy exactly the same field real estate.

## Decision

**Underneath, men at one landmark slide apart like any other stacked bubbles.** Two
men given the same call at the same landmark are laid out like any two bubbles on a row
that would stack (ADR 0059). They sit seam to seam, spread evenly around the landmark,
and shift as a group beside any neighbour. Men at the same spot are ordered across the
field by where they stand, so their lines never cross. The Mike inside the strong safety
takes the inside hook.

**Deep, men called to one ground split it.** The ground a deep call names (ADR 0075) is
split into equal parts, one per man called to it. The parts run left to right in the
order the men line up. Each bubble is its part's width less the seam, and never wider
or narrower than a zone can be sized. Two men on Middle 1/3 each play half of the middle
third, and neither reaches into an outside third. All the deep bubbles still settle at
one depth. A man filling another's zone (`fills`) splits that man's ground, as he plays
it.

**What does not change.** Grounds named by different calls still overlap where the calls
overlap. A Tampa 2 Mike's Middle 1/3 still sits between the two halves, because that
overlap is the coverage. The catalogue's art is unaffected, because its drops carry no
call and never shared. The shell still runs only when the Coach changes who is in it
(ADR 0059). When one of two men leaves a split ground, the man left behind takes all of
it again. Refills read a zone's ground off the call, not off where its bubble is drawn,
so a man in half of the middle third still holds the middle third.

## Consequences

- ADR 0075's scenario "The strong safety's own call: Middle 1/3" now draws two bubbles,
  each half of the middle third, in place of one bubble with two lines. The end on his
  side still drops into the curl/flat he left.
- `tests/e2e/zone-shell.spec.ts` checks the split middle third, two Robbers side by side
  and the Nickel Cover 2 hook case. `tests/domain/zone-shell.test.ts` covers the
  geometry: order, seam, centring and keeping each bubble inside its ground.
