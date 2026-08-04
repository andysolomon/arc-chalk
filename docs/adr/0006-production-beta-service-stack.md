---
status: superseded
superseded_by: 0019-convex-cloud-backend
---

# Use Neon, Cloudflare, and Clerk for the production beta

This decision was superseded by the Convex-based service stack in ADR 0019. Cloudflare hosting, R2, and Clerk remain; Neon, Hyperdrive, Drizzle, and the Worker-hosted data API do not.

Chalk uses a deliberately unbundled production-beta service stack. Neon hosts PostgreSQL, Cloudflare hosts the PWA and API compute and stores binary objects, and Clerk provides authentication. Chalk-owned interfaces isolate the domain and synchronization engine from every provider.

## Consequences

- Neon hosts the PostgreSQL cloud replica described in ADR 0005.
- Cloudflare Workers serve the Vite PWA, authenticated synchronization API, and read-only Share Links.
- Cloudflare Hyperdrive pools and accelerates Worker connections to Neon.
- Cloudflare R2 stores image attachments and generated artifacts; PostgreSQL stores their ownership, metadata, hashes, and lifecycle state.
- Clerk provides invitation-only Coach authentication. Chalk verifies Clerk-issued identity at its API boundary and maps it to its own Coach identifier.
- Drizzle owns the application schema, migrations, and typed server-side queries.
- Domain code does not import provider SDKs. Provider adapters implement Chalk-owned ports for identity, SQL execution, object storage, and deployment runtime services.
- Supabase and Neon Auth are not used for the production beta.
