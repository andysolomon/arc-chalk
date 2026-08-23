import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

import type { ShareAccessOutcome, SharePublication } from "@chalk/domain";

import { parsePublicationJson, type ShareOpenResult } from "./share-location";

const sharesOpen = makeFunctionReference<"mutation">("shares:open");
const sharesCreate = makeFunctionReference<"mutation">("shares:create");
const sharesRepublish = makeFunctionReference<"mutation">("shares:republish");
const sharesRevoke = makeFunctionReference<"mutation">("shares:revoke");
const sharesList = makeFunctionReference<"query">("shares:list");
const assetsConfirm = makeFunctionReference<"mutation">("assets:confirm");
const r2RequestUpload = makeFunctionReference<"action">("r2:requestUpload");
const r2RequestShareDownload = makeFunctionReference<"action">(
  "r2:requestShareDownload",
);

export interface ShareLinkSummary {
  readonly publicId: string;
  readonly publicationId: string;
  readonly title: string;
  readonly createdAtMs: number;
  readonly publishedAtMs: number;
  readonly expiresAtMs?: number;
  readonly revoked: boolean;
}

export interface ShareCloudPort {
  openShare(input: {
    publicId: string;
    secret: string;
  }): Promise<ShareOpenResult>;
  loadAttachment(input: {
    publicId: string;
    secret: string;
    hash: string;
  }): Promise<string | undefined>;
  createShare(input: {
    publicationJson: string;
    secret: string;
    expiresAtMs?: number;
  }): Promise<{ publicId: string }>;
  republishShare(input: {
    publicId: string;
    publicationJson: string;
  }): Promise<{ publicId: string }>;
  revokeShare(publicId: string): Promise<void>;
  listShares(): Promise<readonly ShareLinkSummary[]>;
  requestAssetUpload(input: {
    hash: string;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    width: number;
    height: number;
    byteLength: number;
  }): Promise<
    | { readonly status: "exists" }
    | {
        readonly status: "upload";
        readonly url: string;
        readonly headers: Readonly<Record<string, string>>;
      }
  >;
  confirmAssetUpload(input: {
    hash: string;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    width: number;
    height: number;
    byteLength: number;
  }): Promise<void>;
}

function clientFor(url: string): ConvexHttpClient {
  return new ConvexHttpClient(url, { logger: false });
}

export function createShareCloud(convexUrl: string): ShareCloudPort {
  const client = clientFor(convexUrl);
  return {
    async openShare(input) {
      const result = (await client.mutation(sharesOpen, input)) as
        | { outcome: "granted"; publicationJson: string }
        | { outcome: ShareAccessOutcome };
      if (result.outcome !== "granted" || !("publicationJson" in result)) {
        return { outcome: result.outcome };
      }
      return {
        outcome: "granted",
        publication: parsePublicationJson(result.publicationJson),
      };
    },
    async loadAttachment(input) {
      try {
        const result = (await client.action(r2RequestShareDownload, input)) as {
          url: string;
        };
        return result.url;
      } catch {
        return undefined;
      }
    },
    async createShare(input) {
      return (await client.mutation(sharesCreate, input)) as {
        publicId: string;
      };
    },
    async republishShare(input) {
      return (await client.mutation(sharesRepublish, input)) as {
        publicId: string;
      };
    },
    async revokeShare(publicId) {
      await client.mutation(sharesRevoke, { publicId });
    },
    async listShares() {
      return (await client.query(sharesList, {})) as ShareLinkSummary[];
    },
    async requestAssetUpload(input) {
      return (await client.action(r2RequestUpload, input)) as Awaited<
        ReturnType<ShareCloudPort["requestAssetUpload"]>
      >;
    },
    async confirmAssetUpload(input) {
      await client.mutation(assetsConfirm, input);
    },
  };
}

export function publicationFromJson(json: string): SharePublication {
  return parsePublicationJson(json);
}
