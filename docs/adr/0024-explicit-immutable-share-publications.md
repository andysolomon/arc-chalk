---
status: accepted
---

# Publish immutable snapshots through stable Share Links

A Share Link exposes an explicit Share Publication rather than a Play's changing editor state. Publishing captures immutable revisions and sanitized presentation settings; subsequent private edits appear only after the Coach previews and republishes.

## Consequences

- A Share Publication references specific immutable Play revision IDs.
- A curated publication freezes membership, ordering, title, and presentation options.
- A publication projection removes internal notes, private metadata, revision history, ownership details, and broader Playbook navigation.
- Later editor commits remain private until the Coach invokes `Update shared version`, previews the result, and confirms republication.
- Republishing atomically replaces the publication behind the existing Share Link URL.
- A Coach may configure an optional expiration time and may revoke the link immediately.
- Share capability tokens contain at least 256 bits of cryptographic randomness and only cryptographic hashes are stored.
- Playback, scrubbing, and permitted static downloads consume the published revisions rather than current editor state.
- Recipients do not need an account and receive no editing, commenting, or collaboration capability.
- Source revisions remain immutable and recoverable independently of publication updates or revocation.

