---
status: accepted
amends: 0059-zones-lay-out-as-a-shell
---

# The defense is called by unit, the coverage is in charge, and a zone is the ground its name says

The roster groups a defense into the Front, the Linebackers and the Secondary (ADR
0058), but every call is still put on one man at a time. Nothing ties the men's jobs
together. Two rules tidy up afterwards: the zone shell shares out the field (ADR 0059),
and man coverage matches receivers and reads the scheme (ADR 0060, 0061). Neither
fills a hole. Send the strong safety and his curl/flat stays empty, where a coordinator
drops an end into it. The offense already gives its whole line one Line call. The
defense has nothing like it.

The shell also decides what a deep call means by counting the deep men, not by the
call's name. Give the free safety and the strong safety both Middle 1/3 and the field
splits into halves, so neither plays the middle third. A corner alone on Deep 1/3 owns
the middle of the field.

Product decision (2026-09-30): each group of the defense gets one call, the way a
Madden or College Football play call gives every man his job and lets the units be
adjusted. The coverage call is in charge. The front and linebacker calls say only who
rushes, and the coverage fills what the rushers leave. A zone left by a man sent after
the passer is refilled automatically. Two men may be put in one zone. A zone call is
the ground its name says.

## Decision

It ships in stages: zones by name and shared zones (#187), then the coverage (#188), the
front (#189), and the linebacker call with refilling (#190). Until a stage ships, the
Play behaves as the stages before it describe.

### A zone is the ground its name says (amends ADR 0059)

| Call       | Ground                                                                        |
| ---------- | ----------------------------------------------------------------------------- |
| Middle 1/3 | The middle third of the field                                                 |
| Deep 1/3   | The outside third on his side                                                 |
| Deep 1/2   | The half on his side                                                          |
| Deep 1/4   | The quarter nearest where he stands: a corner's outside one, a safety's inside one; on the line between two, the one on his side |

His side is the side of the ball he stands on. A man straight over the ball takes the
field side; on the middle of the field, the left as the diagram is drawn. The field is
split in its own width, as before, and every deep bubble settles at one depth: 4 yards
behind the deepest man in it, and never shallower than 13.

**Men whose calls name the same ground share it**: one bubble, a line from each. This
holds underneath too. Two men given the same call that lands on the same landmark, such
as two Robbers, share its bubble, where ADR 0059 slid them apart. Bubbles of different
calls that would stack, and drops drawn by hand, are still laid side by side.

Since the shell no longer counts men, mixed calls are drawn as called: Deep 1/4 on two
men to the left and Deep 1/2 on the right is Cover 6. A gap the calls leave stays a
gap, and an overlap they make stays an overlap. A deep drop that is no call, drawn by
hand, stays where it was drawn.

The shell still runs only when the Coach changes who is in it, at the levels that
changed (ADR 0059).

### Unit calls

A **unit call** is put on one group of the defense and gives every man in it his job.
Who is in each group is read off the alignment (ADR 0066, issue #154). A strong safety
lettered S standing ten yards deep is in the Secondary.

| Unit call  | Put on                                                 | Calls                                                                 |
| ---------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| Coverage   | The Secondary, and every linebacker who is not sent    | Cover 0, Cover 1, Cover 2, Tampa 2, Cover 2 Man, Cover 3, Cover 4, Cover 6 |
| Front      | The Front                                              | Rush, Contain, Pinch, Slant left, Slant right, Twist                  |
| Linebacker | The Linebackers                                        | Base, Mike, Will, Sam, Fire, Spy                                      |

The front and linebacker calls are built from the front's own calls (ADR 0064). Rush
sends each man through his own gap. Contain puts the ends on contain and rushes the men
inside them. Pinch slants every man in. Slant left and Slant right slant every man one
gap that way. Twist gives each tackle and end beside him a T-E twist. On the linebacker
call, Base sends nobody. Mike, Will and Sam send that backer through the gap his
alignment owns. Fire sends them all, and Spy puts the Mike on the quarterback.

**The coverage is in charge.** It names the zones the defense plays and who is in man,
and it gives those jobs to the men who drop:

| Coverage    | Deep                                                          | Underneath                                                 | Man                  |
| ----------- | ------------------------------------------------------------- | ---------------------------------------------------------- | -------------------- |
| Cover 0     | —                                                             | Men left once every receiver is taken: Hook                | Everyone who drops   |
| Cover 1     | The free safety: Middle 1/3                                   | Men left once every receiver is taken: Hook (the hole)     | Everyone else        |
| Cover 2     | The safeties: Deep 1/2                                        | Corners: Curl / flat. The rest: Hook                       | —                    |
| Tampa 2     | The safeties: Deep 1/2. The Mike: Middle 1/3                  | Corners: Curl / flat. The rest: Hook                       | —                    |
| Cover 2 Man | The safeties: Deep 1/2                                        | —                                                          | Everyone else        |
| Cover 3     | Corners: Deep 1/3. The free safety: Middle 1/3                | The rest, by where they stand: Curl / flat outside, Hook inside | —               |
| Cover 4     | Corners and safeties: Deep 1/4                                | The rest: Curl / flat outside, Hook inside                 | —                    |
| Cover 6     | The strong safety's side: Deep 1/4. The other side: the free safety, Deep 1/2 | The corner on the half side: Curl / flat. The rest: Curl / flat outside, Hook inside | — |

**How the coverage reads the men** (`coverageJobsOf`, issue #188). The men are read the way
the roster reads them (`defensivePositions`, ADR 0066). The coverage is put on everyone the
roster does not put on the front: the secondary, and until the linebacker call is built,
every linebacker.

- The free safety is the man the roster calls the free safety, else the deepest safety.
  The strong safety is the man it calls the strong safety, else the next deepest. A nickel
  or a dime is neither: he plays underneath, or in man. The Mike is the backer it calls
  the Mike, else the backer nearest the ball.
- "Curl / flat outside, Hook inside": on each side of the ball, the widest man left takes
  the curl/flat and everyone inside him a hook. On a side where a corner already has the
  curl/flat, everyone left plays a hook.
- Cover 6 plays its quarters to the strong safety's side, or to the right when the
  defense has no strong safety.
- In Cover 0 and Cover 1, man match picks the receivers (ADR 0060), and the scheme still
  decides who lines up on his man (ADR 0061). A man that man match leaves with nobody to
  cover, while the offense has receivers, plays a hook instead: the hole. With no offense
  on the field, everyone in man keeps the Man call.
- The catalogue's _Fire zone_ is Cover 3: three deep and three under behind the pressure.
- The zones the coverage must have a man in are its deep zones and the curl/flat on each
  side. A hook is played by whoever is left, so it is never open. Nor is a receiver,
  because man match answers for him.

**How the front call reads the line** (`frontJobsOf`, issue #189). The front is the men the
roster puts on it: the ends, the tackles and the nose. A backer standing up on the line,
like a 3-4's outside backers, is a linebacker, and the front call gives him nothing.

- A man's side is the side of the ball he stands on. A man straight over it counts as
  on the right, as `sideOfBall` reads him.
- Contain's ends are the widest front man on each side, read off the front alone, so a
  backer outside an end does not make the end a tackle.
- Pinch slants everyone in. Slant left sends a man on the left out a gap and a man on
  the right in a gap; Slant right is the reverse.
- Twist pairs the end and the tackle beside him on each side: the tackle crashes out
  first and the end loops inside him. A nose is no side's tackle. A man left over (the
  nose, an end with no tackle beside him, a third man on one side) rushes, so a 3-4
  front under Twist rushes all three.
- The first front call replaces every front man's lines. A man the coverage has dropped
  into a zone keeps it, as he would his own call. The Front row is disabled while nobody
  is on the front. A defensive call from the Defenses browser sets no front call, and its
  front stays as drawn.

**A man's own call.** Putting a unit call on gives every man in the group his job,
replacing what he had. After that, a call the Coach gives one man is his **own call**.
Changing a unit call, and refilling a zone, go around it. Pressing a man's own call
again hands him back to his unit's call; with no unit call on, it takes the call off as
it always has. Pressing a call his unit gave him still takes it off, leaving his zone
open. A defensive call from the Defenses browser sets the coverage it names. Its lines
belong to the units, not to any man, and stay as the art draws them until a unit call or
a refill redraws them.

**A zone left open is refilled in the same step.** A zone is open when the coverage
plays it and the man it gave it to is sent, or is given his own call that takes him out
of it. The nearest man who can take an open zone does:

- **An open deep zone** goes to the nearest defensive back who is not already deep: he
  rotates up, and the zone he left is open in turn.
- **An open underneath zone** goes to the nearest man on the front on its side, who
  stops rushing. This is the zone blitz: every man sent drops one off the front.
- A man with his own call is never moved to fill a zone. When nobody can take it, the
  zone stays open, and the roster names it.

"Nearest" is measured from where he stands to the zone's landmark. Refilling is part of
the call or the change that opened the zone: one command, one undo step.

### Linebacker call and refills (#190)

**The linebacker call** (`linebackerJobsOf`). The backers are the men the roster puts at
the second level (ADR 0066). The Mike is the backer the roster calls the Mike, else the
one nearest the ball, as the coverage reads him. A Will or a Sam the roster does not name
is the backer nearest the Mike on his left, or on his right. **Mike**, **Will** and
**Sam** send that backer through the gap his alignment owns (`ownGapOf`, Rush's
reading), drawn as that gap's quick assignment, so the roster says _A gap_ or _C gap_.
**Fire** sends every backer, **Spy** puts the Mike on the quarterback, and **Base** sends
nobody. The lines it draws are the call's (`unitCall: "linebackers"`). A backer it does
not send plays the coverage: his coverage job when a coverage is on, and what he has when
there is none. The call follows the rules for a man's own call, and pressing the call
that is on takes it off, sending the backers it sent back to the coverage.

**Refills are settled with every edit** (`settleRefills`), in the editor store's step
before man coverage, the way man coverage is settled (ADR 0060). So the linebacker call, a
man's own call, the coverage, the front's call and clearing a man's lines all refill
without each command doing it. The plan (`refillPlanOf`) is worked out afresh from the
coverage's jobs each time:

- A man the coverage gave a zone has left it when he is sent, or has his own call (unless
  it is that same zone). A zone another man already stands in, by his own call, is not
  refilled. A man whose lines were cleared has gone nowhere: Clear leaves nothing drawn,
  and the roster names his deep or curl/flat ground open instead. Clearing a man who was
  sent still releases whoever filled for him.
- **Deep before underneath.** An open deep zone goes to the nearest defensive back
  playing a zone the coverage gave him underneath. A man in man stays on his man, so in
  Cover 1 a free safety put in man leaves the middle open, and the call becomes Cover 0
  as ADR 0061 reads it. The underneath zone the back rotated out of is open in turn.
- **Underneath, the front.** An open curl/flat or hook goes to a man on the front on its
  side, or on either side for a hook over the ball, who has no call of his own. A front
  man's line drawn by hand counts as his own. The zones are shared out by matching: as
  many filled as can be, then the least ground covered, then the first way found taking
  the zones and the men each from the left. So two men the same distance from a zone
  are settled the same way every time: the one on the left.
- **A filler's line is the coverage's**, marked with the man whose zone it took
  (`fills`). It runs from the filler's stance to that man's landmark, and the deep shell
  lays it on that man's ground, not on the filler's side of the ball. When the zone is
  his no longer, a man off the front goes back to what the front gives him
  (`frontJobOf`), and a defensive back to the coverage's job for him.
- Only a change to the coverage, a defender's letter, or whether a man plays a unit
  call's job, has his own call, is sent or has nothing re-plans the refills. Dragging a
  man never swaps who drops.
- The roster's open zones (`openZonesOf`) are the deep zones and curl/flats the defense
  has nobody to give, plus every zone a man left that nobody could take. That includes a
  hook, named _Hook left_, _middle_ or _right_; a hook the coverage gave nobody is never
  open.

As built, matching by distance changes two of the scenarios first written above, which
are corrected there. Under Fire, the right end is nearer the Sam's hook than the right
tackle, so one tackle and both ends drop. With both ends on their own Rush, the tackles
still take the hooks, so only the Will's curl/flat stays open.

### What the Play keeps

A Play keeps its three unit calls, and each line keeps the unit call it came from. A
line without one is its man's own. Both are optional, so a stored Play parses, loads and
renders as before, and a Play with no unit call on behaves as it does today.

## Scenarios

- **4-3 Cover 3, Front Rush, Linebacker Base.** The corners get the outside thirds and
  the free safety the middle. Will, Mike, Sam and the strong safety get Curl / flat,
  Hook, Hook, Curl / flat from left to right. Four men rush.
- **The strong safety's own call: Middle 1/3.** He and the free safety share the middle
  third, with one bubble and two lines. His curl/flat is open, so the end on his side
  drops into it and the tackle beside the end keeps rushing.
- **Linebacker Fire in that Cover 3.** The Will's curl/flat and both hooks are open. The
  left end takes the curl/flat, the left tackle the Mike's hook over the ball, and the
  right end, nearer the Sam's hook than the right tackle is, takes that one. Will, Mike,
  Sam and the right tackle rush: four men, with seven in coverage.
- **The left corner's own call: D gap.** The deep left third is open. The strong safety
  is the only defensive back playing a zone underneath, so he rotates up to it, and the
  right end drops into the curl/flat he left.
- **Fire with the ends on their own Rush calls.** Nobody may move the ends, so the
  tackles take the two hooks and the Will's curl/flat stays open; the roster names it.
  With the tackles on their own calls too, all three stay open and the roster names
  them.

## Consequences

- A lone Deep 1/3 plays his outside third and leaves the middle open, where ADR 0059 gave
  him the middle. A Cover 2 built from two Deep 1/3 calls becomes two outside thirds with
  the middle open the next time its deep shell is laid out. `tests/e2e/zone-shell.spec.ts`
  is rewritten to the new rule.
- Cover 6, and any shell that is not equal shares, can be drawn from quick assignments.
- The defensive inspector's _Play call_ gains Coverage, Front and Linebacker rows that open
  their catalogues, as the offense's Concept and Line call do. The phone's peek bar names
  the coverage.
- A defensive call put on from the Defenses browser now carries a coverage, so the next
  blitz on it refills. A Play put on before this has no coverage and does not refill.
- `docs/original-prototype-parity-matrix.md` records the exception beside ADR 0059.
