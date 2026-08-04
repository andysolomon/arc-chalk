---
status: superseded
superseded_by: 0019-convex-cloud-backend
---

# Use PostgreSQL for synchronized cloud data

This decision was superseded when Convex was selected as Chalk's cloud backend. It remains as a record of the earlier PostgreSQL and Drizzle direction.

Chalk uses managed PostgreSQL as the durable cloud replica because the product combines relational ownership and organization with transactionally checked offline mutations and immutable diagram revisions. Drizzle owns the typed SQL schema and migrations; the product is not fully event-sourced.

## Consequences

- Relational tables store Coaches, Playbooks, Concepts, Formations, Plays, Share Links, assets, and synchronization metadata.
- Immutable `play_revisions` rows store versioned Play documents in `jsonb`, while each Play references its current accepted revision.
- Idempotency keys make retried offline mutations safe, and base-revision constraints detect concurrent branches transactionally.
- Mutation receipts and immutable Play revisions provide audit and recovery history without requiring every read to project an event stream.
- Images and generated artifacts live in object storage; PostgreSQL stores their ownership and metadata.
- Supabase is explicitly excluded. Database hosting, authentication, object storage, and API compute may be separate services, provided Chalk owns the interfaces between them.
- Prisma is not used.
