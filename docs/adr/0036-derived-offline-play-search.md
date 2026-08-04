---
status: accepted
---

# Search derived Play projections entirely on the device

Chalk maintains one compact, rebuildable `PlaySearchProjection` for each current Play and executes structured filtering and full-text search locally. Search does not load all Play revisions or disclose coaching text to a search provider.

## Consequences

- A projection includes Play name, optional call, Unit, Play Type, Concept, Formation, Personnel Label, Tags, Player role labels, Assignment text, and Coach notes.
- Geometry, revision history, image bytes, and Film Reference contents are excluded.
- Typed local indexes support Unit, Play Type, Concept, Formation, personnel, Tags, archive state, conflict state, and sharing state.
- A local full-text index supports token, prefix, and bounded fuzzy matching.
- Index construction and querying run in a Worker with a 50 ms result target at 2,000 Plays.
- Search results use metadata and lightweight cached thumbnails without preloading full Play revisions.
- A Play commit updates its search projection in the same local transaction as current state and queue metadata.
- The full-text index is derived, disposable, versioned, and rebuildable from projections.
- Search and filtering remain fully available offline.
- Chalk does not send Play search content to Algolia, Elasticsearch, telemetry, or any third-party search service.

