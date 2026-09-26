---
status: accepted
amended_by: 0061-the-scheme-decides-whether-man-lines-up
---

# Man coverage lines up on receivers (parity exception to ADR 0039)

The original draws a man call as a fixed shape. The Quick assignments _Man_ button draws
a short dotted arrow straight back off the defender's stance, and a catalogue call's man
assignments — Nickel Cover 1, Bear Front Cover 0 — are dotted arrows drawn where the
original drew them. None of them knows which receiver it is on. Put Nickel Cover 1
against a trips set and the nickel still stands over where a slot would be in a two-by-two
set, pointing at grass; move a receiver and nobody goes with him.

Arc Play Flag's man call follows a man (`lib/play/reducer.ts`, `lib/play/geometry.ts`):
choosing _Man_ asks "Cover who?", the Coach taps a receiver, the line is drawn to him,
and in playback the defender closes on him and shadows his route. A football video game
goes further: a defender given man coverage lines up on the most logical receiver for the
call on its own — corners on the wide receivers, the nickel on the slot, the safety on the
tight end, a linebacker on the back — and the defense shifts when the offense does.

Product decision (2026-09-26): Chalk's man coverage should let the Coach pick the man, as
Arc Play Flag does, and by default line every man defender up on the most logical
receiver for the scheme, as the video game does.

## Decision

**A man call follows a receiver.** A man call is a defender's zone line ending in an
arrow, as before (ADR 0059 leaves it out of the zone shell). It now carries `covers` —
the receiver's Player id, and `chosen` when the Coach picked him. The line is drawn
straight from the defender's stance to just short of his man.

**Who the defense covers** (`coverableReceivers`): every offensive man but the line and
the quarterback. A man at least 2½ yards off the ball and within 6 yards of it is a back.
The rest are counted from the sideline in on each side of the ball: the widest is the
wide receiver, a tight end (by letter or role) or a man attached within 3½ yards of the
end of the line is a tight end, and anyone else is a slot.

**The best match** (`settleManCoverage`). Each defender in man is read from his letter —
C a corner; N (off the ball), NB, D, DB a nickel; F, FS, SS, $ and a deep S a safety;
W, M, B, a shallow S and the other linebacker letters a linebacker; E, T and an N on the
ball a lineman — and from where he stands when the letter says nothing. Each kind prefers
receivers in this order:

| Defender   | 1st   | 2nd   | 3rd          | 4th  |
| ---------- | ----- | ----- | ------------ | ---- |
| Corner     | wide  | slot  | tight        | back |
| Nickel     | slot  | wide  | tight        | back |
| Safety     | tight | slot  | wide or back | —    |
| Linebacker | back  | tight | slot         | wide |

The matching is exact over the whole defense, not one man at a time: as many receivers
as possible are covered, then each defender gets the kind he prefers (one step down his
list outweighs 30 yards of travel), then the nearest across the field, and a man keeps
the receiver he already had in a close call so a nudge re-sorts nobody. Nobody is doubled
by the match; a defender left over when every receiver is taken is free and keeps his
line as drawn. Who is in man is the scheme's to say, so who takes whom follows from it:
with the safety deep in a two-deep call, a linebacker takes the tight end.

**Lining up.** (Since ADR 0061, only in Cover 0 — with deep help nobody in man is moved.) A defender given a man lines up a yard inside him (over him, on a back) at
his own depth held between one and seven yards off the ball. Two defenders on one man
take inside and outside. A defender who would stand within 2.2 yards of another — two
linebackers over stacked I-formation backs, a nickel beside a blitzer — slides across to
the side his man is on until the two read apart.

**When it settles.** On every edit, in the editor store, as part of the same command and
the same undo step. An edit that changes neither the offense nor a man call — nor where a
man in man stands — returns the Play untouched, so a Play stored with man lines is not
rewritten by a rename. When the offense or the man calls change, every man call the Coach
did not pick is matched again. A defender given a different man lines up on him; one whose
man moved without him goes with him, keeping his cushion and his leverage measured toward
the ball; one the Coach dragged stays where he was put, and his line is re-aimed. A pick
is kept while the man picked is still there to cover, and falls back to the best match
when he is not. Putting the defense back in its call (ADR 0055, reset alignment) lines the men in man up
on their receivers afresh, which is where the call puts them.

**Picking a man.** A defender in man gets a _Covers_ row in his Player panel: a list of
the receivers, named by letter and job ("Z — wide right"), headed by _Best match_, and a
_Pick on field_ button. Picking on the field works as Arc Play Flag's targeting does: the
bar over the field asks "Cover who?", the next press on a receiver — within a finger's
reach on touch — gives him that man, and a press anywhere else or Escape puts the pick
down. A phone's sheet drops to its peek and a hidden shadow offense is shown first, so
the field is there to tap. The _Man_ quick assignment is unchanged; it gives the defender
the best match.

**Playback.** A defender in man plays the receiver, not the line: before the snap he
walks across with any motion, and once his line starts he closes on his man and stays
2.2 yards off him on the side he came from until the play ends. His line stays
ghosted rather than traced, since he does not run it.

**Reading the call.** A man defender's spot now depends on the offense, so
`currentDefensiveCall` compares the men in man by their letters and the rest by where
they stand; a call put on without its lines is still read by where it drew everyone.

## Consequences

- A man line is named for its receiver — "C man on Z" — wherever the scene is read, and
  one following nobody is "C man" rather than "C zone".
- Putting on a catalogue call with man assignments over an offense moves its men in man
  off the catalogue's art. The call's other men, its drops and its blitzes are drawn as
  the original draws them.
- Dragging or re-lettering a receiver, or changing the set, can move defenders. The move
  is shown and undone in the same step as the edit. A keystroke that moves a defender is
  its own undo step rather than merging with the next one.
- A Play stored before this change keeps its man lines as drawn until an edit changes the
  offense or a man call; they join the match then, as older drops joined the zone shell.
- Defensive calls in the Madden mould — Cover 1 Hole, Cover 1 Robber, Cover 2 Man — are
  not added to the catalogue here; the Defenses browser's parity screenshot would change
  with them. A Coach builds them from a call and Quick assignments today.
- `docs/original-prototype-parity-matrix.md` records this beside ADR 0059.
