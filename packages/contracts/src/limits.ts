/** A serialized Play revision must stay well under Convex's 1 MiB document cap. */
export const MAX_REVISION_BYTES = 512 * 1024;

/** Convex's hard document size. Binary data never enters a revision document. */
export const MAX_CONVEX_DOCUMENT_BYTES = 1024 * 1024;

/** Bounded push so one mutation stays inside Convex's transaction budget. */
export const MAX_PUSH_BATCH = 32;

/** Pull pages metadata first; full Play documents load by revision id. */
export const MAX_PULL_PAGE = 50;

/** Background sync waits this long after a local edit before draining. */
export const SYNC_DEBOUNCE_MS = 750;

export const SYNC_BACKOFF_MS = [
  1_000, 2_000, 4_000, 8_000, 16_000, 60_000,
] as const;

export const SYNC_BACKOFF_JITTER = 0.2;

export const CURRENT_WIRE_SCHEMA_VERSION = 1;
