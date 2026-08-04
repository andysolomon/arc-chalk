---
status: accepted
supersedes:
  - 0005-postgresql-cloud-replica
  - 0006-production-beta-service-stack
---

# Use Convex as Chalk's cloud backend

Chalk uses Convex Database and TypeScript functions for its synchronized cloud replica and backend behavior. Clerk remains the identity provider, Cloudflare hosts the Vite PWA, and private binary assets remain in R2. IndexedDB remains the device source of truth and Convex never enters the editor's local save or frame-rendering critical paths.

## Consequences

- Convex replaces Neon PostgreSQL, Drizzle, Hyperdrive, and the Worker-hosted application data API.
- Convex queries, mutations, actions, and scheduled functions implement cloud reads, transactional synchronization, Share Links, lifecycle work, and external-service coordination.
- Clerk integrates with Convex authentication, while Chalk maps Clerk subjects to its own stable Coach IDs and checks Coach ownership in every public function.
- Cloudflare hosts and caches the installable PWA and public Share Link shell. It does not own Chalk's application database API.
- R2 remains the private object store for image attachments and generated artifacts because Chalk requires short-lived, revocable access rather than reusable Convex bearer file URLs.
- Domain and local entity IDs are client-generated stable IDs rather than Convex `_id` values so entities can be created offline and survive imports or backend migration.
- Convex tables store Coach mappings, Playbook and Play metadata, Concepts, Formations, immutable Play revisions, mutation receipts, ordered Coach changes, conflicts, Share Links, and asset metadata.
- Each immutable revision stores canonical versioned Play JSON, its content hash, base revision, and provenance. Searchable and sortable metadata remains in separate indexed documents.
- A serialized revision targets no more than 512 KiB and must remain below Convex's 1 MiB document limit. Binary data never enters a revision document.
- Public Convex functions validate arguments, authenticate callers where required, verify ownership, use indexed lookups, and return bounded or paginated results.
- `sync.pushBatch` applies idempotency and base-revision checks inside one Convex mutation; `sync.pullAfter` pages an ordered Coach change stream as specified in ADR 0013.
- Chalk-owned repositories, sync ports, identity ports, and object-storage ports prevent Convex or Clerk APIs from leaking into domain commands.
- Convex's reactive cache and memory-only mutation queue may improve online responsiveness but do not replace Dexie, the durable local queue, or Chalk's conflict model.

