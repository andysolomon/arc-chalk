/**
 * Fragment-held Share Link capabilities (ADR 0030). The route carries only a
 * public identifier; the bearer secret lives after `#` so ordinary HTTP
 * infrastructure never observes it.
 */

export const SHARE_SECRET_BYTES = 32;
export const SHARE_PUBLIC_ID_PREFIX = "share";

const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export class ShareCapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShareCapabilityError";
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  return base64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function looksLikeBase64Url(value: string): boolean {
  return (
    value.length >= 43 &&
    [...value].every((character) => BASE64URL_ALPHABET.includes(character))
  );
}

export function generateShareSecret(
  randomBytes: (size: number) => Uint8Array = (size) =>
    globalThis.crypto.getRandomValues(new Uint8Array(size)),
): string {
  const bytes = randomBytes(SHARE_SECRET_BYTES);
  if (bytes.length !== SHARE_SECRET_BYTES) {
    throw new ShareCapabilityError(
      "A Share Link secret must contain 256 bits of randomness.",
    );
  }
  return bytesToBase64Url(bytes);
}

export function shareLinkPath(publicId: string): string {
  if (publicId.length === 0) {
    throw new ShareCapabilityError("A Share Link needs a public identifier.");
  }
  return `/s/${encodeURIComponent(publicId)}`;
}

export function shareLinkUrl(
  origin: string,
  publicId: string,
  secret: string,
): string {
  if (!looksLikeBase64Url(secret)) {
    throw new ShareCapabilityError("That Share Link secret is malformed.");
  }
  return `${origin.replace(/\/$/, "")}${shareLinkPath(publicId)}#${secret}`;
}

/** Reads `/s/{publicId}` and nothing else — the fragment is not a route param. */
export function publicIdFromSharePath(pathname: string): string | undefined {
  const match = /^\/s\/([^/]+)$/.exec(pathname);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

export function secretFromLocationHash(hash: string): string | undefined {
  const secret = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!looksLikeBase64Url(secret)) return undefined;
  return secret;
}

export function hexFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function bytesFromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^a-f0-9]/i.test(hex)) {
    throw new ShareCapabilityError("Share token hash is malformed.");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Constant-time equality for equal-length byte strings so a Share secret
 * comparison does not leak through timing.
 */
export function constantTimeEqual(
  left: Uint8Array,
  right: Uint8Array,
): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return mismatch === 0;
}

export function constantTimeHexEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  try {
    return constantTimeEqual(bytesFromHex(left), bytesFromHex(right));
  } catch {
    return false;
  }
}

async function importHmacKey(pepper: string): Promise<CryptoKey> {
  if (pepper.length < 32) {
    throw new ShareCapabilityError(
      "The Share token pepper must be at least 32 characters.",
    );
  }
  return globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** Convex stores only this keyed hash — never the fragment secret (ADR 0030). */
export async function hashShareSecret(
  secret: string,
  pepper: string,
): Promise<string> {
  if (!looksLikeBase64Url(secret)) {
    throw new ShareCapabilityError("That Share Link secret is malformed.");
  }
  const key = await importHmacKey(pepper);
  const secretBytes = base64UrlToBytes(secret);
  const payload = new Uint8Array(secretBytes.byteLength);
  payload.set(secretBytes);
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, payload);
  return hexFromBytes(new Uint8Array(signature));
}

export async function shareSecretMatches(
  secret: string,
  storedHash: string,
  pepper: string,
): Promise<boolean> {
  try {
    const actual = await hashShareSecret(secret, pepper);
    return constantTimeHexEqual(actual, storedHash);
  } catch {
    return false;
  }
}

/**
 * Replaces the fragment so a log, referrer, or error payload cannot keep the
 * bearer secret (ADR 0020, ADR 0030).
 */
export function redactShareUrl(value: string): string {
  try {
    const url = new URL(value, "https://chalk.invalid");
    const publicId = publicIdFromSharePath(url.pathname);
    if (!publicId) {
      return url.hash.length > 0
        ? `${url.pathname}${url.search}#redacted`
        : value;
    }
    return `${url.origin}${shareLinkPath(publicId)}#redacted`;
  } catch {
    return value.includes("#")
      ? `${value.slice(0, value.indexOf("#"))}#redacted`
      : value;
  }
}
