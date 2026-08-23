import {
  AssetValidationError,
  IMAGE_JPEG_QUALITY,
  IMAGE_MAX_EDGE,
  IMAGE_THUMBNAIL_EDGE,
  assertDecodedImageLimits,
  assertImageTransferLimits,
  sha256Hex,
  sniffImageMime,
  storedMimeForImage,
  type InputImageMime,
  type StoredImageMime,
} from "./assets";
import { scaleToLongestEdge } from "./assets";

export interface DecodedRaster {
  readonly width: number;
  readonly height: number;
  readonly hasAlpha: boolean;
}

export interface ImageCodec {
  decode(bytes: Uint8Array, mime: InputImageMime): Promise<DecodedRaster>;
  resize(
    source: DecodedRaster,
    width: number,
    height: number,
  ): Promise<DecodedRaster>;
  encode(
    source: DecodedRaster,
    mime: StoredImageMime,
    quality: number,
  ): Promise<Uint8Array>;
}

export interface NormalizedImage {
  readonly hash: string;
  readonly mimeType: StoredImageMime;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly bytes: Uint8Array;
  readonly thumbnailMimeType: StoredImageMime;
  readonly thumbnailBytes: Uint8Array;
  readonly thumbnailWidth: number;
  readonly thumbnailHeight: number;
}

function containsExifMarker(bytes: Uint8Array): boolean {
  // APP1 Exif needs FF E1, two length bytes, then "Exif" — nine bytes.
  for (let index = 0; index <= bytes.length - 9; index += 1) {
    if (
      bytes[index] === 0xff &&
      bytes[index + 1] === 0xe1 &&
      asciiEquals(bytes, index + 4, "Exif")
    ) {
      return true;
    }
  }
  return false;
}

function asciiEquals(
  bytes: Uint8Array,
  offset: number,
  value: string,
): boolean {
  if (bytes.length < offset + value.length) return false;
  return [...value].every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0),
  );
}

export function imageContainsExif(bytes: Uint8Array): boolean {
  return containsExifMarker(bytes);
}

/**
 * Decode, orient, strip camera metadata, resize, thumbnail, and hash. The
 * original bytes are never written — only a re-encoded raster — so EXIF/GPS
 * cannot survive (ADR 0031).
 */
export async function normalizeImage(
  bytes: Uint8Array,
  codec: ImageCodec,
): Promise<NormalizedImage> {
  assertImageTransferLimits(bytes.byteLength);
  const inputMime = sniffImageMime(bytes);
  if (!inputMime) {
    throw new AssetValidationError(
      "Chalk accepts JPEG, PNG, WebP, and HEIC images.",
    );
  }
  let decoded: DecodedRaster;
  try {
    decoded = await codec.decode(bytes, inputMime);
  } catch (error) {
    if (inputMime === "image/heic" || inputMime === "image/heif") {
      throw new AssetValidationError(
        "This browser cannot decode HEIC. Save the photo as JPEG or PNG and attach that.",
      );
    }
    throw error instanceof AssetValidationError
      ? error
      : new AssetValidationError("Chalk could not read that image.");
  }
  assertDecodedImageLimits(decoded.width, decoded.height);
  const full = scaleToLongestEdge(
    decoded.width,
    decoded.height,
    IMAGE_MAX_EDGE,
  );
  const sized =
    full.width === decoded.width && full.height === decoded.height
      ? decoded
      : await codec.resize(decoded, full.width, full.height);
  const mimeType = storedMimeForImage(sized.hasAlpha, inputMime);
  const encoded = await codec.encode(sized, mimeType, IMAGE_JPEG_QUALITY);
  if (imageContainsExif(encoded)) {
    throw new AssetValidationError(
      "Chalk refused to store an image that still carried camera metadata.",
    );
  }
  const thumbSize = scaleToLongestEdge(
    sized.width,
    sized.height,
    IMAGE_THUMBNAIL_EDGE,
  );
  const thumbnailRaster =
    thumbSize.width === sized.width && thumbSize.height === sized.height
      ? sized
      : await codec.resize(sized, thumbSize.width, thumbSize.height);
  const thumbnailMimeType = storedMimeForImage(
    thumbnailRaster.hasAlpha,
    inputMime,
  );
  const thumbnailBytes = await codec.encode(
    thumbnailRaster,
    thumbnailMimeType,
    IMAGE_JPEG_QUALITY,
  );
  const hash = await sha256Hex(encoded);
  return {
    hash,
    mimeType,
    width: sized.width,
    height: sized.height,
    byteLength: encoded.byteLength,
    bytes: encoded,
    thumbnailMimeType,
    thumbnailBytes,
    thumbnailWidth: thumbSize.width,
    thumbnailHeight: thumbSize.height,
  };
}
