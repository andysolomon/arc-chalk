import {
  decideShareAccess,
  hashShareSecret,
  shareAccessEvent,
  sharePublicationSchema,
  shareSecretMatches,
  type ShareAccessEvent,
  type ShareAccessOutcome,
  type ShareLinkState,
  type SharePublication,
} from "@chalk/domain";

export interface ShareStore {
  getLink(publicId: string): Promise<ShareLinkState | undefined>;
  listLinks(coachId: string): Promise<readonly ShareLinkState[]>;
  putLink(link: ShareLinkState): Promise<void>;
  getPublication(publicationId: string): Promise<SharePublication | undefined>;
  putPublication(publication: SharePublication, coachId: string): Promise<void>;
  recordAccess(event: ShareAccessEvent): Promise<void>;
}

export type OpenShareResult =
  | {
      readonly outcome: "granted";
      readonly publication: SharePublication;
    }
  | { readonly outcome: Exclude<ShareAccessOutcome, "granted"> };

export async function createShareLink(
  store: ShareStore,
  input: {
    readonly coachId: string;
    readonly publicId: string;
    readonly publication: SharePublication;
    readonly secret: string;
    readonly pepper: string;
    readonly nowMs: number;
    readonly expiresAtMs?: number;
  },
): Promise<ShareLinkState> {
  const publication = sharePublicationSchema.parse(input.publication);
  const secretHash = await hashShareSecret(input.secret, input.pepper);
  const link: ShareLinkState = {
    publicId: input.publicId,
    coachId: input.coachId,
    publicationId: publication.id,
    secretHash,
    createdAtMs: input.nowMs,
    ...(input.expiresAtMs === undefined
      ? {}
      : { expiresAtMs: input.expiresAtMs }),
  };
  await store.putPublication(publication, input.coachId);
  await store.putLink(link);
  return link;
}

export async function republishShareLink(
  store: ShareStore,
  input: {
    readonly coachId: string;
    readonly publicId: string;
    readonly publication: SharePublication;
    readonly nowMs: number;
  },
): Promise<ShareLinkState> {
  const existing = await requireOwnedLink(store, input.publicId, input.coachId);
  const publication = sharePublicationSchema.parse(input.publication);
  const link: ShareLinkState = {
    ...existing,
    publicationId: publication.id,
  };
  await store.putPublication(publication, input.coachId);
  await store.putLink(link);
  void input.nowMs;
  return link;
}

export async function revokeShareLink(
  store: ShareStore,
  input: {
    readonly coachId: string;
    readonly publicId: string;
    readonly nowMs: number;
  },
): Promise<ShareLinkState> {
  const existing = await requireOwnedLink(store, input.publicId, input.coachId);
  const link: ShareLinkState = { ...existing, revokedAtMs: input.nowMs };
  await store.putLink(link);
  return link;
}

export async function rotateShareSecret(
  store: ShareStore,
  input: {
    readonly coachId: string;
    readonly publicId: string;
    readonly secret: string;
    readonly pepper: string;
    readonly nowMs: number;
  },
): Promise<ShareLinkState> {
  const existing = await requireOwnedLink(store, input.publicId, input.coachId);
  const secretHash = await hashShareSecret(input.secret, input.pepper);
  const link: ShareLinkState = { ...existing, secretHash };
  await store.putLink(link);
  void input.nowMs;
  return link;
}

export async function setShareExpiry(
  store: ShareStore,
  input: {
    readonly coachId: string;
    readonly publicId: string;
    readonly expiresAtMs?: number;
  },
): Promise<ShareLinkState> {
  const existing = await requireOwnedLink(store, input.publicId, input.coachId);
  const link: ShareLinkState = {
    publicId: existing.publicId,
    coachId: existing.coachId,
    publicationId: existing.publicationId,
    secretHash: existing.secretHash,
    createdAtMs: existing.createdAtMs,
    ...(existing.revokedAtMs === undefined
      ? {}
      : { revokedAtMs: existing.revokedAtMs }),
    ...(input.expiresAtMs === undefined
      ? {}
      : { expiresAtMs: input.expiresAtMs }),
  };
  await store.putLink(link);
  return link;
}

export async function openShareLink(
  store: ShareStore,
  input: {
    readonly publicId: string;
    readonly secret: string;
    readonly pepper: string;
    readonly nowMs: number;
  },
): Promise<OpenShareResult> {
  const record = await store.getLink(input.publicId);
  const secretMatches = record
    ? await shareSecretMatches(input.secret, record.secretHash, input.pepper)
    : false;
  const outcome = decideShareAccess(record, secretMatches, input.nowMs);
  await store.recordAccess(
    shareAccessEvent(input.publicId, outcome, input.nowMs),
  );
  if (outcome !== "granted") return { outcome };
  if (!record) return { outcome: "not-found" };
  const publication = await store.getPublication(record.publicationId);
  if (!publication) return { outcome: "not-found" };
  return {
    outcome: "granted",
    publication: sharePublicationSchema.parse(publication),
  };
}

async function requireOwnedLink(
  store: ShareStore,
  publicId: string,
  coachId: string,
): Promise<ShareLinkState> {
  const existing = await store.getLink(publicId);
  if (!existing || existing.coachId !== coachId) {
    throw new Error("Share Link not found");
  }
  return existing;
}
