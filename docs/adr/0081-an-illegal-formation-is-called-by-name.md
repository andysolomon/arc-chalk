---
status: accepted
---

# An illegal formation is called by name: covered receivers, a twelfth man, a man over the ball, and shipped sets that pass the rule (amends ADR 0073)

ADR 0073 taught the field to count: who is on the line of scrimmage, who is a back, and
that no code allows more than four backs. It left one thing undecided, and said so:
_which receivers are eligible — the two men at the ends of the line and the backs, so a
tight end covered by a receiver on the line cannot catch a pass — is not decided here_.
It also left the shipped sets as the original drew them, every receiver level with the
line, and noted that _most read eight to ten on the line_.

Product request (2026-11-03): the app has to abide by the rules of football, most of all
how many men are on the line of scrimmage and which men should be on it, and it has to
see and understand when a formation is illegal. The set that prompted it had X alone on
the left, and Y, Z and H all up on the line to the right with the five linemen — nine on
the line, two backs. ADR 0073 called it legal. A Coach would not: Y and Z are covered,
and neither can catch a pass.

## What was wrong

- Only the four-back limit was a fault. A man drawn past the ball, a twelfth man on the
  field with seven still on the line, and a receiver covered by the man outside him all
  read as legal.
- The shipped sets failed the rule the app was about to be given. Gun Doubles stood H and
  Y on the line inside X and Z; Trips stood Y and H inside Z; the I and Strong stood Z
  level with Y; Ace stood X and Z level with both tight ends; Bunch stood Y and Z level,
  with Y inside. The Stick — Thunder starter stood Z level with Y, and Y runs the _over_
  route. The demo Plays and the defensive demo's shadow offense were drawn from the same
  numbers.

## Decision

**Who can catch a pass is read off the line.** The man at each end of the line and the
backs are eligible. A lettered man on the line between the two ends — a tight end, a
receiver, a back brought up as a wing — is _covered_ by the end on his side of the ball:
he can block, but a pass to him is illegal touching and a route is an ineligible man
downfield. A lineman is never covered: he is known by his letter, none or LT, LG, C, RG,
RT, and not by his depth, so a set drawn deeper than the shipped ones still reads its
unlettered men as the line, and a sixth unlettered man on the end of a jumbo set is the
end, not a covered man. `scrimmageLine` in `@chalk/domain` now carries `eligible`,
`covered` (each man with the end covering him) and `acrossTheLine`.

**Four faults, in the order a Coach fixes them.** `faults` lists what is wrong: a man
over the line of scrimmage (an offensive man past the ball), too many men (more than
eleven on offense), too many backs (ADR 0073's call, unchanged), and the covered men.
`legal` is true when the list is empty. Fewer than eleven men is still an unfinished
drawing, not a fault.

**The call names the man.** The count in the field's lower left (ADR 0073) now carries
one line per fault, in the error colours, and stays while any of them holds: _Y is
covered by Z — only the end man on the line can catch a pass_; _X is over the line of
scrimmage_; _Too many men — 12 on offense, 11 at most_; and the four-back call as
before. An unlettered lineman is named for his spot. The status bar's _LINE 8 · BACKS 3_
turns to the error colour on any fault and lists them in its title. The chip carries
`data-line-faults` so a test can ask which fault is showing. It is still a call, never a
block: a Coach mid-edit or drawing a scout look can stand any formation he likes.

**Arrange is held to it too.** A rearrangement that would newly cover a man is greyed
with the reason — _Y would be covered by Z_ — alongside ADR 0073's refusals. A man
already covered before the rearrangement does not count against it.

**The shipped sets pass the rule.** Each stock set keeps the end man of each side on the
line and stands the men inside him a yard under it, at the original's 460 where it drew
them at 452: the outside receivers stay on the line in the gun sets and their slots step
off; the tight end and the split end are the ends in the I and Strong, with Z the
flanker off; both tight ends are on in Ace with X and Z off; Y is the point on the line
in Bunch with Z and H off. Every set is seven on the line and four backs with its
receivers eligible, and a domain test holds each one to it. The starter stands Z a step
off the line, so the Stick — Thunder reads _LINE 7 · BACKS 4_, and his route sets out
from where he now stands. The demo Plays and the defensive demo's shadow offense are
corrected the same way, and the tour's clicks follow the men.

A set a Coach saved from the old slots is still recognised: the reading tolerance is
fourteen of the original's pixels, and the slots moved eight.

## Consequences

- Nothing new is stored in a Play; a Play already drawn with a covered receiver opens
  with the call showing and is the Coach's to fix or keep.
- The parity goldens (ADR 0039) were captured from the original's sets. Z in the
  starter stands eight pixels lower than the original drew him, and each formation card
  draws its slots a row under the line; what moves is the men, not the chrome.
- The regressions are `tests/e2e/line-alignment.spec.ts` (Z brought up on the line
  covers Y and the call says so until he steps back off; X off the line too is a fifth
  back) and `tests/e2e/phone-line-alignment.spec.ts` (the same on a phone, with the call
  clear of the sheet), each ending in a screenshot of the field. In isolation,
  `tests/domain/line-of-scrimmage.test.ts` lists the ways the reading could go wrong and
  holds every shipped set, the starter and the demo Plays to the rule;
  `tests/editor/play-verbs.test.ts` lines men up on a ten-man Trips, since with the
  shipped slots off the line, X joining the backs on eleven men would be a fifth.
- `tests/e2e/arrange-menu.spec.ts` now expects X, Y and Z at one depth to be refused for
  six backs rather than read as already level; `tests/e2e/run-game.spec.ts` and
  `tests/e2e/motion-clearance.spec.ts` pick Z where the set now stands him.
