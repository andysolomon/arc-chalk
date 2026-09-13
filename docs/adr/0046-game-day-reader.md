---
status: accepted
---

# The Game Day reader consumes a prepared revision and keeps the sideline's notes apart (additive extension under ADR 0039)

Present mode shows one play with playback and an "← → variations" hint. A coordinator
on the sideline needs the calls he prepared, by number, in the order he reads them,
without a keyboard and without walking back into the editor — and he must never be
handed a packet that changed under him. GitHub #67 asked for a dedicated Game Day
reader on the prepared plans of ADR 0042.

## Decision

**What it reads.** Game Day (the header destination from ADR 0044) lists the plans that
have been prepared and opens one **Prepared Revision** — never the live library. The
reader shows the coordinator unit, plan name, opponent and game label, the prepared
stamp, and the calls by section with their stable codes. The revision the reader was
opened on is the revision it stays on: editing a source Play or the plan afterwards
shows a notice and changes nothing here; preparing again offers **Switch to the newest**
and does not switch by itself.

**How it is found.** Situation tabs (All, Favorites, each section, Unsectioned), a
search that answers to a code by prefix or a name by word, and a list or a two-column
grid. Previous and Next step through what is shown; **Back to _section_** returns to the
section the current call is listed in and clears the search. Left and right arrows do
the same for a keyboard. Which section, filter, call, layout and search were open is
written to the device as they change (`gameDay.v1`, IndexedDB), so rotation, a
background and a reload land back there.

**What cannot happen.** The diagram is rendered with no pointer handlers and
`touch-action: pan-y`: a swipe, a pan, a resting palm or a Pencil cannot move a man.
Playback is offered on demand behind **Play it** and keeps its scrubber and rates out of
the call list.

**Readiness.** The reader checks the revision on this device — every call's Play in
the revision, every image those Plays reference in the local image store — and says
**Ready offline · N calls** or **Not ready offline — missing …** by name. It never
reports the app shell's cached state as the plan's.

**Notes and marks.** A game note, a **Called** count and a result (Gain, Loss, Score,
Turnover) live beside the revision on this device, keyed by revision id, apart from
the authored Play and apart from the plan. A new packet starts clean; the old packet
keeps what was written on it.

**Present.** Present mode gains visible Previous and Next controls and a labeled
**Back** beside its esc hint, so a thumb can step variations. This ships independently
of the reader.

## Parity

Additive. Present's stage, type scale and keyboard are unchanged; the two step
controls and the Back label sit in its bar. Nothing else in the desktop states moves.
Recorded in `docs/original-prototype-parity-matrix.md`; the Present gap is re-measured
in `docs/parity/README.md`.

## Not decided here

Cloud replication of plans and revisions (ADR 0042 leaves plans device-local) and a
100-call retrieval study with coaches. The reader's search is built for that target
and a fixture of 100 calls is exercised in tests; the five-second measurement is a
walkthrough to run with a coordinator.
