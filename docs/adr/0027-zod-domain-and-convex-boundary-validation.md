---
status: accepted
---

# Validate versioned domain data with Zod Mini and Convex boundaries with native validators

Chalk validates persisted and exchanged domain documents independently of TypeScript compilation. Zod 4 Mini owns versioned domain schemas and migrations, while Convex native validators protect public functions and cloud table shapes.

## Consequences

- Zod 4 Mini schemas validate Play documents, repository reads, backup contents, Share Publication projections, and versioned wire contracts.
- Every persisted domain document includes an integer `schemaVersion`.
- Loading identifies the version, validates that historical shape, runs a pure sequential migration chain, and validates the current result.
- New writes always serialize the current schema version.
- Unknown future versions produce a safe `Update Chalk` state rather than partial or best-effort parsing.
- Invalid IDs, coordinates, timing, references, and geometry are reported and quarantined rather than silently coerced.
- Canonical serialization and content hashing run only after current-schema validation succeeds.
- Fixture examples for every released schema version remain permanently in migration tests.
- Every public Convex query, mutation, action, and HTTP action validates both arguments and return values with native `v` validators.
- Convex table runtime validation and strict table-name typing remain enabled.
- Public functions do not use `v.any()` for externally supplied structures.
- Convex validates the storage and transport envelope; the versioned domain schema validates canonical Play payloads inside that envelope.

