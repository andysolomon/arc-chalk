---
status: accepted
---

# Use strong platform encryption without beta end-to-end encryption

The production beta protects confidential coaching data with transport encryption, provider-managed encryption at rest, strict application authorization, private object access, and encrypted Coach-controlled backups. Chalk does not claim end-to-end encryption in beta and does not introduce recovery-key workflows that could strand a Coach's data.

## Consequences

- All application, API, database, and object-storage traffic uses TLS.
- Convex and R2 provider-managed encryption at rest protect cloud data.
- R2 buckets remain private; access uses narrowly scoped, short-lived signed operations.
- Every API operation authenticates the caller and verifies ownership against Chalk's stable Coach identity.
- Logs, analytics, traces, and error payloads exclude Play names, diagrams, Assignments, notes, Share tokens, and binary content.
- Share Link bearer tokens are generated with strong entropy and stored only as cryptographic hashes.
- Coach-controlled backups are encrypted before leaving the device.
- Named production operators receive least-privilege access, and production data access is audited.
- Chalk-owned persistence and object-storage ports preserve a future seam for envelope encryption.
- Future end-to-end encryption requires a separate decision covering recovery keys, device enrollment, searchable metadata, conflicts, migration, and encrypted Share Links.
