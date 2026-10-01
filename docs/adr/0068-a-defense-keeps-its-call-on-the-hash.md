---
status: accepted
---

# A defense keeps its call on the hash

A Coach spotting the ball on a hash for a defensive Play (issue #159) saw the men
move and then everything else disagree with them. The undo entry read *Ball on the
right hash*, the sidebar's **Ball on** row still said *Middle* with **R hash** left
pressable, the **Defensive call** row turned to *Custom front*, and the install
page's footer printed *middle hash*. Pressing **R hash** again dragged the defense
another hash to the right; going to **L hash** from there left the Mike in the
middle of the field.

The cause was that "where the ball is" was read three ways. The **Ball on** control
and the spotting itself read it off the offense's men — none on a defensive Play,
which reads as the middle — so the men were moved from a ball that never moved with
them. The defensive field, which the gaps and the landmarks are measured from, read
it off the front, but gathered that front around the middle of the field, so on the
hash it found two of the four linemen and put the ball between them. And the call
was recognised by comparing the men to the catalogue at the middle, exactly, so the
hash's squeeze on the boundary side ended it.

## Decision

**One reading of where the ball is.** `playBallLateralYards` is the ball for a Play
of either side. With an offense on the field it is under the centre, or among the
line, as before. A defense drawn alone lines up on the ball, so its front says: the
front is the men at the line gathered around the middle of the defense, and the
ball is what that front straddles. A hash squeezes the boundary side of a front and
gives the field side some back, which pulls the front's middle off the spot by at
most the front's half-width times the spread between the tightest squeeze and the
most given back, so a front that close to a spot is on it — where the men over the
ball stand exactly — and one further off has the ball at its middle. **Ball on**,
spotting the ball, the defensive field, the camera's ball and every export's hash
read this one value, so the sidebar, the status, the undo entry, the printed footer
and a defender's gaps and landmarks agree with the men, and spotting the hash the
ball is on already moves nobody.

**A call is read from the ball, each side squeezed by one factor.** A defense is
placed rather than realigned, so there are still no roles to match: the men stand
where the call puts them, letters and all, or it is not that call. Where the call
puts them is now measured from the ball, with each side of it scaled by the one
factor a hash puts on that side, read off the widest man on it — the same reading
that keeps a set its name once its splits are tightened, with the same three pixels
across and two deep. A call spotted on either hash, or brought back to the middle
with the squeeze still in it, is still that call in the sidebar, the Defenses
browser and every export. A call is put on where the catalogue draws it whatever
hash the offense in front of it is on, so a call is also read from there. A man in
man is still compared by his letter and his call.

**A customised call names its source.** Once a man has been moved by hand the
defense is a custom front, and wherever *Custom front* was shown — the sidebar's
**Defensive call** row, the picker, the **Shadow defense** row of an offensive Play,
and the footer of every printed page — it now reads *Custom · from 4-3 Cover 3*
while the Play still remembers the call it was put in, so the Coach knows which
front and coverage his variant came from. A defense the Play remembers no call for
is still *Custom front*.

Not changed: picking a call while the ball is on a hash still puts the new men
where the catalogue draws them, in the middle, and the reading follows them there.
Placing a newly picked call on the ball's spot is a separate change.

## Evidence

`tests/e2e/defensive-hash.spec.ts` runs at 1440 × 960 on a new defensive Play in
4-3 Cover 3. **R hash** moves the whole front right, the row reads *R hash*, the
undo entry names the right hash, the status says the boundary was tightened and the
call is still *4-3 Cover 3*; undo puts the Mike back in the middle and redo on the
hash; a reload reads the hash and the call back off the saved men; the install
page's footer prints *Base · 4-3 Cover 3 · right hash*, saved as
`install-right-hash.png`; **L hash** carries the Mike a hash left of the middle; and
dragging him makes the row read *Custom · from 4-3 Cover 3* with the ball still on
the left hash, saved as `defense-on-the-left-hash.png`. It fails on the previous
build at the first assertion after **R hash** is pressed. `tests/domain/defensive-hash.test.ts` covers the
ways the reading could be wrong while that journey still looked right: the spot
read off a squeezed front, the same hash pressed twice, hash to hash, the field's
ball and landmarks, pressed corners, a defense dragged off every spot, one end
dragged wider, recognition on the hash, under a shadow offense wider than the
corners, back in the middle, with man calls on, one man moved, and every stock call
on either hash.
