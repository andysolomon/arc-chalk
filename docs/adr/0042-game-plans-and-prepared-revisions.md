---
status: accepted
---

# Game Plans as curated, numbered views with prepared revisions (additive extension under ADR 0039)

The original prototype's library is one flat body of Plays. Its whole-playbook and call
sheet outputs consume that library as it stands, so a Coach cannot prepare a weekly
coordinator packet — a chosen subset, sectioned and numbered — without either deleting
Plays from the season or duplicating them. GitHub #66 asks for a Playbooks workspace
with reusable game plans, sections, and stable call numbers.

## Decision

A **Game Plan** is a durable record inside a Playbook: a name, the coordinator unit it
belongs to, opponent and game label, an ordered list of **Sections**, and a list of
**Calls**. A Call references one Play by id — a variation is its own Play, so the
reference is explicit — and carries one **call code**. Plans are views: adding a Play
to a plan never copies its editable source, and one Call may be listed in several
Sections while remaining one Call with one code.

- Codes are unique within a plan (the schema refuses duplicates). A collision is
  reported with its holder and nothing is renumbered on the Coach's behalf; sorting a
  section by code reorders without touching any code. An empty code is allowed.
- Removing a Section keeps its Calls in the plan; they print under **Unsectioned**
  until placed. Removing a Call removes it from every Section.
- A plan defaults to a fixed selection. A saved search may be kept with the plan and
  expanded only by an explicit action that first shows how many Plays it would add.
- Bulk additions (multi-select, everything matching a filter, a Concept's variants,
  duplicating last week's plan) state the exact count and target section before they
  apply.

**Prepare for game** freezes a **Prepared Revision**: the plan as it stands and every
referenced Play's document with its hash. The revision is immutable. Printed call
sheets, wristbands, handouts, and the game-day reader consume the revision, never the
live library, so a packet already handed out cannot change under a coach.

- Editing a source Play, or the plan, afterwards flags the plan as behind its revision
  (`revisionStatus`). Chalk never re-prepares silently; the Coach prepares again when
  he means to distribute a new packet.
- A source Play deleted after a revision was made is carried forward from the previous
  revision's copy on the next prepare, marked as carried. A Call whose Play exists in no
  revision is listed as **Missing play** and still prints with its code. Calls are never
  silently omitted.
- A wristband holds eight cells; a plan with more Plays prints as many bands as it
  takes, each on its own page and named "Band 1 of 2", rather than cutting at the
  band. A configurable band (#71) may later let the Coach pick which calls go on it.
- The packet fixes its own diagram presentation — print type, full field, layers set
  per sheet — so the editor's live page, type and layer settings when a coach presses
  print cannot change what the prepared revision produces.

## Storage and portability

Plans and revisions are local-first IndexedDB records (`gamePlans`, `gamePlanRevisions`,
database version 2) and travel in encrypted backups. Older backups without them still
restore. Cloud replication of plans is not part of this decision; the sync entity kinds
stay as they were, and plans remain device-local until a later ADR extends the replica.

## Parity

Additive: the original's library panel, Playbook browser, Export menu entries and their
library-wide outputs are unchanged. The workspace is reached from the More menu, the
command palette, and a button in the Playbook browser; navigation promotion is #65's
decision. Recorded in `docs/original-prototype-parity-matrix.md`.

## Language

Added to `CONTEXT.md`: Game Plan, Call, Section, Prepared Revision.
