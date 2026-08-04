---
status: accepted
---

# Make editing local-first

Chalk accepts edits into the device-local database immediately so creating, opening, editing, saving, undoing, and exporting Plays remain fully usable without a network connection and within the product's interaction budgets. The cloud is a durable synchronized replica for recovery and multi-device continuity; synchronization runs in the background, detects conflicts from a Play's base revision, and never blocks local editing or local save acknowledgement.

## Consequences

- The UI distinguishes **Saved on this device** from **Synced to cloud**.
- A Coach who has previously authenticated on a device retains full access to that device's local Playbooks when identity cannot be refreshed. Authentication gates cloud synchronization, Share Link administration, and account operations—not local work.
- Explicit sign-out asks whether to keep or remove that device's local data; authentication failure never silently deletes or hides locally owned work.
- Offline mutations require a durable local queue and retry semantics.
- Conflicting offline revisions branch at the Play level and are preserved for Coach resolution rather than silently resolved with last-write-wins or field-level geometry merging.
- Client, database, authentication, and hosting choices must support an installable offline PWA and background synchronization.
