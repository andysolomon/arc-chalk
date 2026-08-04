# Chalk

Chalk is a football play-design and playbook product for an individual coach. The beta keeps each coach's football work private and independently owned.

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

**Share Link**:
A revocable, read-only presentation of one Play or a curated set of Plays. It grants no ownership, editing, history, internal-note, or broader Playbook access.
_Avoid_: Collaboration, invitation, public playbook

**Film Reference**:
An external link associated with a Play for coaching context. Chalk does not own, upload, transcode, stream, or offline-cache the referenced video.
_Avoid_: Hosted video, film library
