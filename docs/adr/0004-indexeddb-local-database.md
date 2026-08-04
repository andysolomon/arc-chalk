---
status: accepted
---

# Use IndexedDB as the local database

Chalk uses IndexedDB as its device-local storage substrate because it provides broadly supported asynchronous transactions, indexes, structured values, blobs, and worker access without the WASM, OPFS, locking, and Safari complexity of browser-side SQLite. Domain and application code depend on a typed repository interface rather than IndexedDB or a particular wrapper library.

## Consequences

- Separate stores hold Playbook metadata, Plays, immutable Play revisions, queued sync mutations, conflicts, preferences, and lightweight image blobs.
- Database access may move to a worker where measurement shows a main-thread impact.
- Every schema migration is tested against fixtures from supported older database versions.
- Chalk requests persistent browser storage, reports storage health, and provides encrypted backup/export and restore paths.
- Dexie 4 core implements the IndexedDB layer behind Chalk-owned repositories; Dexie Cloud and Dexie-specific React hooks are not used, and domain/editor modules do not depend on Dexie types.
