import type { StoredImageMime } from "@chalk/domain";

export interface SignedObjectAccess {
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly expiresAtMs: number;
}

export interface ObjectStorePort {
  signPut(
    key: string,
    contentType: StoredImageMime,
    expiresAtMs: number,
  ): Promise<SignedObjectAccess>;
  signGet(key: string, expiresAtMs: number): Promise<SignedObjectAccess>;
}

export interface AssetRecord {
  readonly hash: string;
  readonly mimeType: StoredImageMime;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly createdAtMs: number;
  readonly ownerIds: readonly string[];
}

export interface AssetMetadataStore {
  getByHash(hash: string): Promise<AssetRecord | undefined>;
  put(record: AssetRecord): Promise<void>;
}

export type AssetUploadDecision =
  | { readonly status: "exists" }
  | { readonly status: "upload"; readonly upload: SignedObjectAccess };

const PUT_TTL_MS = 15 * 60 * 1000;
const GET_TTL_MS = 5 * 60 * 1000;

export async function requestAssetUpload(
  store: AssetMetadataStore,
  objects: ObjectStorePort,
  input: {
    readonly coachId: string;
    readonly hash: string;
    readonly mimeType: StoredImageMime;
    readonly width: number;
    readonly height: number;
    readonly byteLength: number;
    readonly nowMs: number;
    readonly objectKey: string;
  },
): Promise<AssetUploadDecision> {
  const existing = await store.getByHash(input.hash);
  if (existing) {
    if (!existing.ownerIds.includes(input.coachId)) {
      await store.put({
        ...existing,
        ownerIds: [...existing.ownerIds, input.coachId],
      });
    }
    return { status: "exists" };
  }
  const upload = await objects.signPut(
    input.objectKey,
    input.mimeType,
    input.nowMs + PUT_TTL_MS,
  );
  return { status: "upload", upload };
}

export async function confirmAssetUpload(
  store: AssetMetadataStore,
  input: {
    readonly coachId: string;
    readonly hash: string;
    readonly mimeType: StoredImageMime;
    readonly width: number;
    readonly height: number;
    readonly byteLength: number;
    readonly nowMs: number;
  },
): Promise<AssetRecord> {
  const existing = await store.getByHash(input.hash);
  if (existing) {
    const ownerIds = existing.ownerIds.includes(input.coachId)
      ? existing.ownerIds
      : [...existing.ownerIds, input.coachId];
    const record = { ...existing, ownerIds };
    await store.put(record);
    return record;
  }
  const record: AssetRecord = {
    hash: input.hash,
    mimeType: input.mimeType,
    width: input.width,
    height: input.height,
    byteLength: input.byteLength,
    createdAtMs: input.nowMs,
    ownerIds: [input.coachId],
  };
  await store.put(record);
  return record;
}

export async function requestAssetDownload(
  store: AssetMetadataStore,
  objects: ObjectStorePort,
  input: {
    readonly hash: string;
    readonly objectKey: string;
    readonly nowMs: number;
    readonly allowed: boolean;
  },
): Promise<SignedObjectAccess> {
  if (!input.allowed) {
    throw new Error("Unauthorized");
  }
  const record = await store.getByHash(input.hash);
  if (!record) throw new Error("Asset not found");
  return objects.signGet(input.objectKey, input.nowMs + GET_TTL_MS);
}

export function coachOwnsAsset(
  record: AssetRecord | undefined,
  coachId: string,
): boolean {
  return record?.ownerIds.includes(coachId) === true;
}
