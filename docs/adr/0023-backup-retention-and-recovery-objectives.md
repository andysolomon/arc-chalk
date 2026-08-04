---
status: accepted
---

# Recover synced cloud data within defined beta objectives

Chalk combines Convex backups, off-platform retention, immutable application revisions, delayed deletion, R2 retention controls, and restore drills. A cloud outage may interrupt synchronization and Share Links but does not interrupt locally available editing.

## Consequences

- Production runs on a Convex plan supporting daily automated backups.
- A weekly downloadable production backup is retained off-platform for 90 days; staging backups remain separate from production.
- R2 objects are addressed by content hash and never overwritten in place.
- A 30-day R2 bucket lock prevents accidental attachment deletion or replacement.
- Deleted Plays and Playbooks enter Trash for 30 days before permanent deletion.
- Immutable revisions remain recoverable while their Play exists and throughout its Trash period.
- Share Link revocation takes effect immediately even when the referenced data remains recoverable internally.
- The beta recovery point objective for synchronized cloud history is 24 hours.
- The beta recovery time objective for synchronization and Share Links is four hours.
- Device-local editing remains available during cloud recovery.
- A complete restore drill is required before beta and monthly thereafter.
- Restore verification covers record counts, revision hashes, asset hashes, Coach authorization boundaries, and representative Share Links.
- Encrypted Coach-controlled exports remain independent of operational backup systems.
- Retention and account-deletion disclosures must accurately describe the 30-day recovery window.

