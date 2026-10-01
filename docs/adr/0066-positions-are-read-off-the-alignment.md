---
status: accepted
amends: 0058-assignments-only-inspector-and-play-sidebar
---

# Positions are read off the alignment, and personnel off the men (parity exception to ADR 0039)

The roster, the Player panel and the printed pages said what a man plays by his letter
alone. A coach auditing a 72-play library found where that mislabels the football
(issue #154):

- The Formations browser calls I-Form and Strong **21** personnel, but the install page
  and the full playbook print an I-Form run as **11P**: the tailback is lettered H, the
  slot's letter in a gun set, and the count read him as a slot. The original prototype
  does the same, since its `playMeta` reads the men and never the set.
- In the I-Form roster the H was a _Slot_ under Skill and the F a plain _Back_.
- In Nickel Cover 2 the nickel, lettered N, sat under **Front** as the _Nose_, and the
  second deep-half safety, lettered S and seventeen yards deep, under **Linebackers** as
  the _Sam_. 4-3 Cover 2 listed two men as _S — Sam_. 4-3 and 3-4 Cover 3 called the
  strong safety _\$ — Nickel_ in a base defense.
- Bear Front Cover 0 lettered two men N — the nose and a defensive back — so they could
  not be told apart on the roster, the wristband or the install page.
- A man call is a zone line to the model (ADR 0060: it owns no ground and ends in an
  arrow at a man), so the line inspector's heading and the Player panel's line list
  called it _Zone_ while the field and the roster said _C man on X_.

Product decision (2026-09-30, issue #154): personnel, positions and coverage labels are
derived consistently from the set and the assignment semantics, and print keeps the
same coaching words. Under-center depths are left as the original draws them.

## Decision

**A letter that names a position keeps it; the rest is read off the field.**
`offensivePositions` and `defensivePositions` in `packages/domain` are the one reading,
and the roster, the Player panel and the printed pages all take their words from it.

_Offense._ X and Z are receivers, Y and U tight ends, Q the quarterback, and LT, LG, C,
RG, RT the line, wherever each stands. The backs' letters — F, B, T, R — and H, A and
no letter at all say nothing by themselves, so those men are read off where they stand,
using the same reading man coverage uses to decide whom a defender can cover (ADR 0060):
in the backfield — at least 2½ yards off the ball and within 6 of it — a man is a back;
split out he is the wide receiver on his side or a slot; attached to the line he is a
tight end. Among the backs, one alone is the **Back**; with more, the deepest is the
**Tailback** and the shallowest the **Fullback** when each stands a yard clear of the
next, and backs level with each other — split backs, a wishbone's halfbacks — are Backs.
The group is where he stands: the quarterback and the backfield are Backs, the line the
Line, everyone else Skill. So in the I-Form the H is the Tailback and the F the
Fullback; in Strong, whose art stands the F deep and the H offset, the F is the Tailback
and the H the Fullback; in Empty the F is a Slot; and in the seeded Stick — Thunder the F
split out past the X is a Receiver among the skill men and the H behind the quarterback
a Back.

_Personnel_ counts the men on the field, not where they stand. F, B, T and R are backs
wherever they line up — Empty is still 11 — and an H or an A is a back when he stands in
the backfield, so the I-Form and Strong read 21 on their own. The two readings never count
one man twice: the backs are the larger of the lettered backs and the men standing at
back, so the seeded Stick — Thunder, its F split wide and its H behind the quarterback,
is still 11. The printed strip takes the
Play's own label first, then the personnel of the set the Play is in — the same words the
status bar and the Formations browser use — and only then the count.

_Defense._ E and T are ends and tackles, W and M the Will and the Mike, C a corner, F the
free safety, SS the strong safety, D the dime, B a backer. N, S and \$ are read off the
stance, as man coverage already reads them: an **N on the ball is the Nose** and off it
the **Nickel**; an **S in the box is the Sam** and ten yards or deeper the **Strong
safety**; a **\$ is the Strong safety** unless the defense already has one lettered, in
which case he is the fifth defensive back, the **Nickel**. An unlettered man is read the
same way: on the front — within the front's depth and reach of the ball (ADR 0064) — he
is the Nose over the ball, an End as the outside man on his side, and a Tackle between;
at the second level a Linebacker; in the secondary a Corner on the numbers, a Safety deep
and a Nickel over the slot. The front is read against the offense's ball, so a call over
a set on the hash reads as it should. The group is his level: the front, the
linebackers, the secondary.

**Bear Front Cover 0's fourth defensive back is the F.** The original letters him N, like
the nose. The call fields four defensive backs, so he is not a nickel but the free safety
walked down — the one letter every other call has and this one lacked. The nose keeps his
N, as in the 3-4. No other letter changes: the two S of the 4-3 two-high calls are the
original's Sam and strong safety and the reading tells them apart, and the \$ of the
one-high calls is the strong safety rolled down, which is what the original draws.

**A man call is Man.** `lineKindWord` says what a line is the way a Coach does: a man
line is _Man_, never _Zone_, in the line inspector's heading and the Player panel's line
list, and the roster's summary names the man he has — _Man on Z_ — as the field and the
install table already did.

## Consequences

- The roster of the seeded Stick — Thunder lists the F among the skill men and the H among
  the backs, and its install page still prints 11P: the F split wide and the H at back
  are one back between them. Measured against `main` on one Linux machine, those words
  move the parity states by 0 to 215 px of 1,382,400: Editor 35,254 to 35,316, Print
  unchanged at
  35,697, More menu 36,750 to 36,965, Export 37,110 to 37,172, Save 35,394 to 35,456,
  Palette 36,053 to 36,096, Formations 36,770 to 36,815, Defenses 29,679 to 29,724,
  Shortcuts 59,679 to 59,721. Every state passes with the CI rasterization delta, as on
  `main`, and no ratchet is raised.
- `tests/e2e/man-coverage.spec.ts` matches the Bear's F and \$ to receivers as safeties
  rather than a nickel and a safety.
- Formation recognition, realignment pairing and concept propagation still work by
  `assignRoles`, where the H stays the H: what a man is called is a different question
  from which man he is when a set changes.
- Every stored Play loads, renders and exports unchanged; only its words change.
- `docs/original-prototype-parity-matrix.md` records the exception.

## Evidence

`tests/e2e/football-metadata.spec.ts` runs at 1440 × 960. An I-Form play reads
_I-FORM RIGHT · 21_ in the status bar, _F — Fullback_ and _H — Tailback_ among the Backs,
and 21P on the install page and the handout; Strong reads the F as the Tailback. Nickel
Cover 2 lists the N as the Nickel and the S as the Strong safety in the Secondary; 4-3
Cover 2 tells its Sam from its strong safety; 4-3 Cover 3's \$ is the Strong safety.
Nickel Cover 1 over Gun Doubles names each man's receiver in the roster and reads _Man_
in the line inspector. The Bear letters every man once. It saves the roster and the
printed sheet at each stage. `tests/domain/positions.test.ts` covers the ways the reading
could be wrong on a set or a call the journey does not open.
