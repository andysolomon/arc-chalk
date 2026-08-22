export type SyncStatus =
  "local" | "syncing" | "synced" | "offline" | "conflict";

export {
  coachOwnsAsset,
  confirmAssetUpload,
  createShareLink,
  openShareLink,
  republishShareLink,
  requestAssetDownload,
  requestAssetUpload,
  revokeShareLink,
  rotateShareSecret,
  setShareExpiry,
  type AssetMetadataStore,
  type AssetRecord,
  type AssetUploadDecision,
  type ObjectStorePort,
  type OpenShareResult,
  type ShareStore,
  type SignedObjectAccess,
} from "@chalk/contracts";
