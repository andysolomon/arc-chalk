import * as z from "zod/mini";

/** Inputs larger than this are refused before decode (ADR 0031). */
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
/** Decoded width × height may not exceed this (ADR 0031). */
export const IMAGE_MAX_MEGAPIXELS = 40;
export const IMAGE_MAX_PIXELS = IMAGE_MAX_MEGAPIXELS * 1_000_000;
/** Longest edge of the normalized attachment (ADR 0031). */
export const IMAGE_MAX_EDGE = 2560;
/** Longest edge of the list/preview thumbnail (ADR 0031). */
export const IMAGE_THUMBNAIL_EDGE = 512;
export const IMAGE_JPEG_QUALITY = 0.92;
export const IMAGE_CAPTION_MAX_LENGTH = 120;
export const FILM_LABEL_MAX_LENGTH = 80;
export const FILM_URL_MAX_LENGTH = 2048;

export const contentHashSchema = z.string().check(z.regex(/^[a-f0-9]{64}$/));

export const storedImageMimeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const inputImageMimeSchema = z.union([
  storedImageMimeSchema,
  z.literal("image/heic"),
  z.literal("image/heif"),
]);

const assetIdSchema = z.string().check(z.minLength(1));

export const playAttachmentSchema = z.object({
  id: assetIdSchema,
  hash: contentHashSchema,
  mimeType: storedImageMimeSchema,
  width: z.number().check(z.int(), z.positive()),
  height: z.number().check(z.int(), z.positive()),
  byteLength: z.number().check(z.int(), z.positive()),
  caption: z.optional(
    z.string().check(z.minLength(1), z.maxLength(IMAGE_CAPTION_MAX_LENGTH)),
  ),
});

export const filmReferenceSchema = z
  .object({
    id: assetIdSchema,
    url: z.string().check(z.minLength(1), z.maxLength(FILM_URL_MAX_LENGTH)),
    label: z.optional(
      z.string().check(z.minLength(1), z.maxLength(FILM_LABEL_MAX_LENGTH)),
    ),
  })
  .check(
    z.refine((reference) => {
      try {
        validateFilmReferenceUrl(reference.url);
        return true;
      } catch {
        return false;
      }
    }, "Film References must use a public https address."),
  );

export type ContentHash = z.infer<typeof contentHashSchema>;
export type StoredImageMime = z.infer<typeof storedImageMimeSchema>;
export type InputImageMime = z.infer<typeof inputImageMimeSchema>;
export type PlayAttachment = z.infer<typeof playAttachmentSchema>;
export type FilmReference = z.infer<typeof filmReferenceSchema>;

export class AssetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetValidationError";
  }
}

const JPEG_MAGIC = [0xff, 0xd8, 0xff] as const;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function startsWith(
  bytes: Uint8Array,
  magic: readonly number[],
  offset = 0,
): boolean {
  if (bytes.length < offset + magic.length) return false;
  return magic.every((value, index) => bytes[offset + index] === value);
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(
    ...bytes.subarray(offset, offset + length).values(),
  );
}

function heicBrand(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  if (asciiAt(bytes, 4, 4) !== "ftyp") return false;
  const brands =
    `${asciiAt(bytes, 8, 4)}${asciiAt(bytes, 16, 32)}`.toLowerCase();
  return ["heic", "heix", "heif", "heim", "mif1", "msf1"].some((brand) =>
    brands.includes(brand),
  );
}

/**
 * Identifies JPEG, PNG, WebP, and HEIC from magic bytes so a Coach's camera
 * roll is classified before any decoder runs.
 */
export function sniffImageMime(bytes: Uint8Array): InputImageMime | undefined {
  if (startsWith(bytes, JPEG_MAGIC)) return "image/jpeg";
  if (startsWith(bytes, PNG_MAGIC)) return "image/png";
  if (
    bytes.length >= 12 &&
    asciiAt(bytes, 0, 4) === "RIFF" &&
    asciiAt(bytes, 8, 4) === "WEBP"
  ) {
    return "image/webp";
  }
  if (heicBrand(bytes)) return "image/heic";
  return undefined;
}

export function assertImageTransferLimits(byteLength: number): void {
  if (byteLength <= 0) {
    throw new AssetValidationError("That file is empty.");
  }
  if (byteLength > IMAGE_MAX_BYTES) {
    throw new AssetValidationError(
      "Images must be 20 MB or smaller before Chalk attaches them.",
    );
  }
}

export function assertDecodedImageLimits(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new AssetValidationError("Chalk could not read that image.");
  }
  if (width * height > IMAGE_MAX_PIXELS) {
    throw new AssetValidationError(
      "Images must be 40 megapixels or smaller before Chalk attaches them.",
    );
  }
}

export function scaleToLongestEdge(
  width: number,
  height: number,
  maxEdge: number,
): { readonly width: number; readonly height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Opaque images become JPEG; images that actually use transparency stay PNG
 * so a Coach's overlay is not flattened onto white (ADR 0031).
 */
export function storedMimeForImage(
  hasAlpha: boolean,
  input: InputImageMime,
): StoredImageMime {
  if (hasAlpha) return "image/png";
  if (input === "image/webp") return "image/webp";
  return "image/jpeg";
}

function stripControls(value: string): string {
  return [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .trim();
}

export function sanitizeImageCaption(
  caption: string | undefined,
): string | undefined {
  if (caption === undefined) return undefined;
  const cleaned = stripControls(caption);
  if (cleaned.length === 0) return undefined;
  if (cleaned.length > IMAGE_CAPTION_MAX_LENGTH) {
    throw new AssetValidationError(
      `Captions must be ${IMAGE_CAPTION_MAX_LENGTH} characters or fewer.`,
    );
  }
  return cleaned;
}

export function sanitizeFilmLabel(
  label: string | undefined,
): string | undefined {
  if (label === undefined) return undefined;
  const cleaned = stripControls(label);
  if (cleaned.length === 0) return undefined;
  if (cleaned.length > FILM_LABEL_MAX_LENGTH) {
    throw new AssetValidationError(
      `Film labels must be ${FILM_LABEL_MAX_LENGTH} characters or fewer.`,
    );
  }
  return cleaned;
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.",
  "0.0.0.0",
  "[::1]",
  "::1",
]);

function isPrivateIpv4(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return true;
  const [a, b] = octets as [number, number, number, number];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/**
 * Film References are external https links Chalk never fetches, proxies, or
 * caches. The URL is checked so a javascript: or local address cannot be
 * stored as coaching context.
 */
export function validateFilmReferenceUrl(value: string): string {
  const trimmed = stripControls(value);
  if (trimmed.length === 0) {
    throw new AssetValidationError("A Film Reference needs an https address.");
  }
  if (trimmed.length > FILM_URL_MAX_LENGTH) {
    throw new AssetValidationError(
      `Film addresses must be ${FILM_URL_MAX_LENGTH} characters or fewer.`,
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AssetValidationError(
      "That Film Reference is not a valid web address.",
    );
  }
  if (parsed.protocol !== "https:") {
    throw new AssetValidationError(
      "Film References must use https so the clip stays on its own host.",
    );
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new AssetValidationError(
      "Film References cannot include a username or password.",
    );
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname.length === 0 ||
    BLOCKED_HOSTS.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    isPrivateIpv4(hostname) ||
    hostname.startsWith("[")
  ) {
    throw new AssetValidationError(
      "Film References must point at a public https host.",
    );
  }
  return parsed.href;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function contentAddressedObjectKey(hash: string): string {
  const parsed = contentHashSchema.parse(hash);
  return `images/${parsed}`;
}
