"use node";

import { makeFunctionReference } from "convex/server";
import { actionGeneric as action } from "convex/server";
import { v } from "convex/values";

import { contentAddressedObjectKey, contentHashSchema } from "@chalk/domain";

const mime = v.union(
  v.literal("image/jpeg"),
  v.literal("image/png"),
  v.literal("image/webp"),
);

function r2Config(): {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
} {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Private image storage is not configured.");
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

async function hmacSha256(key: Uint8Array, value: string): Promise<Uint8Array> {
  const keyCopy = new Uint8Array(key.byteLength);
  keyCopy.set(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyCopy,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const encoded = new TextEncoder().encode(value);
  const message = new Uint8Array(encoded.byteLength);
  message.set(encoded);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, message);
  return new Uint8Array(signature);
}

function hex(buffer: ArrayBuffer | Uint8Array): string {
  return [...(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

async function presign(
  method: "GET" | "PUT",
  key: string,
  contentType: string | undefined,
  expiresSeconds: number,
): Promise<{ url: string; headers?: Record<string, string> }> {
  const config = r2Config();
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const region = "auto";
  const now = new Date();
  const stamp = now.toISOString().replaceAll("-", "").replaceAll(":", "");
  const amzDate = `${stamp.slice(0, 15)}Z`;
  const dateStamp = amzDate.slice(0, 8);
  const credential = `${config.accessKeyId}/${dateStamp}/${region}/s3/aws4_request`;
  const signedHeaders = contentType ? "content-type;host" : "host";
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((name) => `${encodeRfc3986(name)}=${encodeRfc3986(query[name]!)}`)
    .join("&");
  const canonicalHeaders = contentType
    ? `content-type:${contentType}\nhost:${host}\n`
    : `host:${host}\n`;
  const canonicalRequest = [
    method,
    `/${config.bucket}/${key}`,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const requestBytes = new TextEncoder().encode(canonicalRequest);
  const requestCopy = new Uint8Array(requestBytes.byteLength);
  requestCopy.set(requestBytes);
  const digest = hex(await crypto.subtle.digest("SHA-256", requestCopy));
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    `${dateStamp}/${region}/s3/aws4_request`,
    digest,
  ].join("\n");
  const dateKey = await hmacSha256(
    new TextEncoder().encode(`AWS4${config.secretAccessKey}`),
    dateStamp,
  );
  const regionKey = await hmacSha256(dateKey, region);
  const serviceKey = await hmacSha256(regionKey, "s3");
  const signingKey = await hmacSha256(serviceKey, "aws4_request");
  const signature = hex(await hmacSha256(signingKey, stringToSign));
  const url = `https://${host}/${config.bucket}/${key}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  return {
    url,
    ...(contentType ? { headers: { "content-type": contentType } } : {}),
  };
}

const getOwned = makeFunctionReference<"mutation">("assets:getOwned");
const prepareUpload = makeFunctionReference<"mutation">("assets:prepareUpload");
const authorizeAsset = makeFunctionReference<"mutation">(
  "shares:authorizeAsset",
);

export const requestUpload = action({
  args: {
    hash: v.string(),
    mimeType: mime,
    width: v.number(),
    height: v.number(),
    byteLength: v.number(),
  },
  returns: v.union(
    v.object({ status: v.literal("exists") }),
    v.object({
      status: v.literal("upload"),
      url: v.string(),
      headers: v.record(v.string(), v.string()),
      expiresAtMs: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    contentHashSchema.parse(args.hash);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const prepared = (await ctx.runMutation(prepareUpload, args)) as {
      status: "exists" | "upload";
    };
    if (prepared.status === "exists") return { status: "exists" as const };
    const key = contentAddressedObjectKey(args.hash);
    const expiresAtMs = Date.now() + 15 * 60 * 1000;
    const signed = await presign("PUT", key, args.mimeType, 15 * 60);
    return {
      status: "upload" as const,
      url: signed.url,
      headers: signed.headers ?? { "content-type": args.mimeType },
      expiresAtMs,
    };
  },
});

export const requestDownload = action({
  args: { hash: v.string() },
  returns: v.object({
    url: v.string(),
    expiresAtMs: v.number(),
  }),
  handler: async (ctx, args) => {
    contentHashSchema.parse(args.hash);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const allowed = await ctx.runMutation(getOwned, {
      hash: args.hash,
    });
    if (!allowed) throw new Error("Unauthorized");
    const key = contentAddressedObjectKey(args.hash);
    const expiresAtMs = Date.now() + 5 * 60 * 1000;
    const signed = await presign("GET", key, undefined, 5 * 60);
    return { url: signed.url, expiresAtMs };
  },
});

export const requestShareDownload = action({
  args: {
    publicId: v.string(),
    secret: v.string(),
    hash: v.string(),
  },
  returns: v.object({
    url: v.string(),
    expiresAtMs: v.number(),
  }),
  handler: async (ctx, args) => {
    contentHashSchema.parse(args.hash);
    const allowed = await ctx.runMutation(authorizeAsset, {
      publicId: args.publicId,
      secret: args.secret,
      hash: args.hash,
    });
    if (!allowed) throw new Error("Unauthorized");
    const key = contentAddressedObjectKey(args.hash);
    const expiresAtMs = Date.now() + 5 * 60 * 1000;
    const signed = await presign("GET", key, undefined, 5 * 60);
    return { url: signed.url, expiresAtMs };
  },
});
