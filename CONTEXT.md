# Chalk

Chalk is a football play-design and playbook product for an individual coach. The beta keeps each coach's football work private and independently owned.

## Product constraint

`Chalk Football Play Editor-2/Chalk Play Editor.dc.html` is the canonical visual and behavioral specification. The production app is a faithful clone-and-extend reimplementation: preserve every original feature and the established design, fix verified defects, and add production capabilities without redesigning the Coach's workflow.

## Language

**Coach**:
The individual who owns and manages one or more private Chalk Playbooks.
_Avoid_: Team, program, organization, workspace owner

**Playbook**:
The private, durable body of football knowledge a Coach maintains across a season; it persists beyond any single diagram or editing session.
_Avoid_: Project, workspace, drawing collection

**Concept**:
A reusable football idea, such as Mesh, Flood, Inside Zone, or Cover 3, that may organize multiple related Plays.
_Avoid_: Parent play, folder

**Play**:
A callable implementation of an optional Concept with specific personnel, formation, motion, assignments, adjustments, and diagram. A Play owns a durable snapshot and is not silently rewritten when a reusable source changes.
_Avoid_: Drawing, concept variation, canvas document

**Formation**:
A reusable, role-aware alignment template that a Coach copies into a Play. A Play remembers its source Formation, but later Formation changes affect it only through an explicit previewed reapplication.
_Avoid_: Live template, player preset

**Base alignment**:
The set and the defensive call a Coach can reset a side of the ball to when he wants a clean start rather than the one he chose — Gun Doubles Right on offense, 4-3 Cover 3 on defense. Resetting to it chooses it; nobody is added.
_Avoid_: Default formation, starting template

**Shadow**:
The other unit's men, lines and notes drawn on a Play that is not theirs — the defense under an offensive play, the offense under a defensive one. A Coach shows or hides it; it never changes what the Play is.
_Avoid_: Opponent, scout team, the other play

**On the line**:
Standing level with the snapper — within half a yard of his depth on the diagram. Every other man of the offense is a back. No more than four backs are allowed, so with eleven on offense at least seven are on the line; there is no most. A receiver a step off the line is a back.
_Avoid_: Lineman (a position, not a place), on the ball

**Zone shell**:
A defense's zone drops taken together rather than one defender at a time. Each zone is the ground its call names — Middle 1/3, the outside third on a man's side, his half, his quarter — men called into the same zone share it, and bubbles of different zones sit side by side instead of stacking.
_Avoid_: Coverage template, zone preset

**Defensive call**:
A front and a coverage the defense lines up in, with the lines its men run, chosen from the Defenses browser — 4-3 Cover 3. It sets where the men stand; Unit calls set what they do.
_Avoid_: Defense preset, defensive formation

**Unit call**:
One call given to a whole group of the defense — the Front, the Linebackers or the Secondary — that sets the job of every man in it except those with an Own call.
_Avoid_: Group assignment, defensive concept, line call (that is the offense's)

**Coverage**:
The Unit call that is in charge of the defense — Cover 3, Cover 4 — naming the zones it plays and who is in man, giving those jobs to every man who drops, linebackers included, and refilling an Open zone.
_Avoid_: Coverage template, shell preset

**Own call**:
A job the Coach gives one man after his group has a Unit call. Unit calls and refills work around it and never change it.
_Avoid_: Override, hot route

**Open zone**:
A zone the Coverage plays that nobody is left to drop into.
_Avoid_: Hole (the Cover 1 hole is a zone someone plays), gap (a gap is in the offensive line)

**Defensive adjustment**:
A change to defenders' alignment, rush, coverage technique, or responsibilities within a Play. It can address the entire defense, a position group, or selected men.
_Avoid_: New defensive call, replacement formation

**Offense read key**:
A defender whose reaction the offense reads to choose a give, keep, pitch, or pass. Option Read, Pitch Key, RPO Read, and Pass Key identify that defender's place in the offense's decision.
_Avoid_: Defensive read, man match

**Defensive read**:
An offensive player a defender watches for an option, pitch, RPO, or pass cue. It is the defender's coaching responsibility and can coexist with his designation as an Offense read key.
_Avoid_: Offense read key, coverage target

**Plaster**:
A defender's instruction to stay attached to a receiver when the quarterback scrambles. It supplements the original coverage with a scramble response.
_Avoid_: Blitz, spy, base man coverage

**Man match**:
The receiver a defender in man covers. By default the defense matches its men in man to the receivers it makes most sense for each to take — corners the wide receivers, the nickel the slot, the safety the tight end, a linebacker the back — and lines each up on his man; the Coach can pick a different man, which is kept while that man is on the field. The defense matches again whenever the offense changes.
_Avoid_: Man assignment target, coverage pairing

**Play Type**:
An optional Coach-managed classification within a Play's Unit, seeded with useful football types but open to custom definitions. A Play never requires classification below Unit.
_Avoid_: Category, Unit, mandatory hierarchy

**Personnel Label**:
An optional searchable label describing the package used by a Play without acting as a Player or Formation template.
_Avoid_: Personnel entity, roster package

**Assignment**:
Optional Play-owned coaching direction for one Player that may combine the Coach's exact wording with ordered structured football actions.
_Avoid_: Route label, required task template

**Share Link**:
A revocable, read-only presentation of one Play or a curated set of Plays. It grants no ownership, editing, history, internal-note, or broader Playbook access.
_Avoid_: Collaboration, invitation, public playbook

**Film Reference**:
An external link associated with a Play for coaching context. Chalk does not own, upload, transcode, stream, or offline-cache the referenced video.
_Avoid_: Hosted video, film library

**Film Observation**:
What was seen on one snap of film: where each man lined up and how each moved, measured from the ball, before anything is named. It records what happened on that snap, not what was called, so it becomes a Play only when the Coach accepts a draft of it.
_Avoid_: Recognized play, detected formation, film import

**Game Plan**:
A named, durable view kept in one Playbook — its home, where it is listed, printed and prepared from — for one game and one coordinator unit: which Plays will be called, from that book or any other of the Coach's, the Sections they are called from, and the code each answers to. It references Plays and never copies their editable source.
_Avoid_: Game playbook, weekly playbook copy, folder

**Call**:
One Play's place in a Game Plan, with one stable call code. The Play may live in any of the Coach's Playbooks; a Call from another book says which. A Call may be listed in several Sections and remains one Call.
_Avoid_: Play copy, numbered play, slot

**Section**:
An ordered heading inside a Game Plan — Openers, 3rd down, Red zone — that lists Calls in the order the coordinator reads them. Removing a Section never removes its Calls.
_Avoid_: Folder, category, tag

**Prepared Revision**:
The immutable snapshot **Prepare for game** makes of a Game Plan and every Play it references. Printed packets and the game-day reader consume a Prepared Revision, never the live library; later edits flag the plan as behind it.
_Avoid_: Export, published playbook, sync snapshot
