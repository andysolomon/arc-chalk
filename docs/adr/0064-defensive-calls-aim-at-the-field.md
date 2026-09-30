---
status: accepted
amends: 0059-zones-lay-out-as-a-shell
---

# A defender's calls aim at the field, and the front has its own (parity exception to ADR 0039)

The original draws every quick assignment as a fixed shape off the defender's stance, and
its defensive catalogue as fixed art. A defensive coach building 32 plays found where that
breaks (issue #165):

- An underneath zone keeps the defender's own depth. A safety at 18 yards given
  **Curl / flat** gets a bubble 20 yards deep, in the deep third. **QB spy** does the same.
- The Cover 3 calls draw the $ to a spot 14 yards deep, which reads as deep, so the diagram
  looks like four deep over the strong corner's third, and the roster says only _Zone_.
- **Blitz** is 3.7 yards straight ahead of the man, so a linebacker's arrow stops short of
  the line and names no gap. The catalogue's blitzes stop short too.
- A defensive lineman is offered only coverage words — Hook, Curl / flat, Deep 1/3 — plus
  Blitz and Stunt, and every call leaves the front with nothing to do.

Product decision (2026-09-29, issue #165): zone quick assignments land at their landmark
regardless of alignment, Cover 3 gives the $ a named underneath zone, pressure goes through
a named gap past the line, the front gets rush, contain, gap, slant and twist calls and the
calls fill them in, and a spy sits over the quarterback.

## Decision

**The field is read off the Play** (`defensiveFieldOf`). The ball is the offense's (its
center, else its line); a Play with no offense has its ball where its front centres. The
gaps are the spaces in the offensive line where it stands: A either side of the center,
B between guard and tackle, C between tackle and an inline tight end — or a split outside
the tackle without one — and D a half split outside that. A side with fewer than two
linemen is given the original's line, five men 36 canvas pixels apart. The quarterback is
the man lettered Q or QB, else the back nearest the line behind the ball, else a gun
quarterback over the ball. The front is every defender within 50 canvas pixels of the ball
(the roster's rule) and 10 yards of it across.

**Calls aim at that field.** `LinePreset.pointsFrom(stance, field)` takes it, and
`applyLinePresetCommand` passes the Play's.

| Call                             | Lands                                                                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hook                             | 10 yards deep, over the ball for a man within 2 yards of it, else 4.5 yards out on his side                                                                                                                        |
| Curl / flat                      | 10 yards deep, 12 yards out on his side, held a yard inside the sideline                                                                                                                                           |
| Robber                           | 11 yards deep over the ball                                                                                                                                                                                        |
| QB spy                           | 6 yards deep over the quarterback                                                                                                                                                                                  |
| A / B / C / D gap                | Through that gap on his side at the line of scrimmage, and 2 yards on past it                                                                                                                                      |
| Rush                             | Through the gap he owns: the nearest on his side, the inside one when he is head up (within a quarter yard of even)                                                                                                |
| Contain                          | Up the field half a yard outside the D gap (or outside him, if wider), then turned in toward the quarterback                                                                                                       |
| Slant in / out                   | One gap over from his own, a yard and a half through; inside the A gap is the other A gap                                                                                                                          |
| T-E / E-T twist                  | Played by two: the man given it and the front man beside him. The outside man of the pair is the end. The one going first crashes one gap over; the other jabs, loops behind him and comes through the gap he left |
| Spill                            | A yard inside at the line, then under the block 2 yards into the backfield                                                                                                                                         |
| Squeeze                          | A yard and a half inside, closing the gap down, ending in a bar                                                                                                                                                    |
| Deep 1/3, 1/2, 1/4, Mid 1/3, Man | Unchanged: the deep shell (ADR 0059) and man coverage (ADR 0060, 0061) place them                                                                                                                                  |

Hook, Curl / flat and Robber then join the underneath shell as before, so a safety rolled
down leaves the deep shell to the men still in it and his bubble is laid beside the others.

**What a defender is offered** (`defensivePresetsFor`): a man on the front gets the
front's calls first (Rush, Contain, Slant in, Slant out, T-E twist, E-T twist, Spill,
Squeeze), then the gaps, then the coverage a zone blitz can drop him into; everyone else
the gaps and the coverage. The Player panel, the phone tray and a defensive line's redraw
offer that list. **Blitz** and **Stunt** are retired: a line drawn with one still says so,
but they are no longer offered.

**The catalogue says what each line is.** Every drop, man call and blitz carries the key of
the quick assignment it is, so the roster names it and its button reads pressed. Where the
art was wrong the line is drawn as that quick assignment would draw it against the
original's line: the Cover 3 $ (4-3, 3-4, Dime) is Curl / flat, the Dime nickel a hook, and
every blitz goes through a gap (Fire Zone: E C gap, both tackles A gap, M B gap, $ D gap;
3-4: strong backer C gap; Bear: W A gap, M B gap). A man on the front the call gives no
line keeps contain on the outside or rushes his gap inside. A call's underneath drops are
laid out as a shell when it is built, so none stack; drops already clear keep the original's
art, and the deep art is kept.

## Consequences

- A defensive call puts four or five more lines on the field than the original's, and the
  Defenses browser draws them. `tests/parity/production-shell.spec.ts` records the change.
- A catalogue call is still drawn against the original's centred line: a call put on beside
  an offense on the hash rushes where the centred line would be, as its men already stand.
  Calling Rush or a gap on one of them re-aims it at the offense on the field.
- Technique is read, not set: a man's gap is the one his alignment owns, and moving him
  moves his gap. There is no call that realigns a lineman to a technique.
- Every stored Play loads, renders and exports unchanged; only a line drawn after this, or
  a call put on, is aimed at the field.
- `docs/original-prototype-parity-matrix.md` records the exception.
