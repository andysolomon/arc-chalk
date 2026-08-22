import type { ShareAccessOutcome, SharePublication } from "@chalk/domain";
import {
  publicIdFromSharePath,
  secretFromLocationHash,
  sharePublicationSchema,
} from "@chalk/domain";

export interface ShareOpenResult {
  readonly outcome: ShareAccessOutcome | "granted";
  readonly publication?: SharePublication;
}

export async function openShareFromLocation(
  open: (input: {
    publicId: string;
    secret: string;
  }) => Promise<ShareOpenResult>,
  location: Pick<Location, "pathname" | "hash"> = window.location,
): Promise<
  | { readonly status: "missing-link" }
  | { readonly status: "missing-secret" }
  | ShareOpenResult
> {
  const publicId = publicIdFromSharePath(location.pathname);
  if (!publicId) return { status: "missing-link" };
  const secret = secretFromLocationHash(location.hash);
  if (!secret) return { status: "missing-secret" };
  return open({ publicId, secret });
}

export function parsePublicationJson(json: string): SharePublication {
  return sharePublicationSchema.parse(JSON.parse(json) as unknown);
}
