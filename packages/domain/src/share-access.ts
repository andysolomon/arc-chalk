export type ShareAccessOutcome =
  "granted" | "not-found" | "invalid-secret" | "revoked" | "expired";

export interface ShareLinkState {
  readonly publicId: string;
  readonly coachId: string;
  readonly publicationId: string;
  readonly secretHash: string;
  readonly createdAtMs: number;
  readonly expiresAtMs?: number;
  readonly revokedAtMs?: number;
}

export interface ShareAccessEvent {
  readonly publicId: string;
  readonly atMs: number;
  readonly outcome: ShareAccessOutcome;
}

/**
 * Decides whether a presented secret opens a Share Link. The secret itself is
 * never stored on this record and never belongs in an audit event.
 */
export function decideShareAccess(
  record: ShareLinkState | undefined,
  secretMatches: boolean,
  nowMs: number,
): ShareAccessOutcome {
  if (!record) return "not-found";
  if (record.revokedAtMs !== undefined) return "revoked";
  if (record.expiresAtMs !== undefined && nowMs >= record.expiresAtMs) {
    return "expired";
  }
  if (!secretMatches) return "invalid-secret";
  return "granted";
}

export function shareAccessEvent(
  publicId: string,
  outcome: ShareAccessOutcome,
  atMs: number,
): ShareAccessEvent {
  return { publicId, atMs, outcome };
}
