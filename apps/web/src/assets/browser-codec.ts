import {
  AssetValidationError,
  IMAGE_JPEG_QUALITY,
  type DecodedRaster,
  type ImageCodec,
  type InputImageMime,
  type StoredImageMime,
} from "@chalk/domain";

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function require2dContext(
  canvas: OffscreenCanvas | HTMLCanvasElement,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context || !("getImageData" in context)) {
    throw new AssetValidationError("Chalk could not read that image.");
  }
  return context;
}

function rasterFromCanvas(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  hasAlpha: boolean,
): DecodedRaster & { canvas: OffscreenCanvas | HTMLCanvasElement } {
  return {
    width: canvas.width,
    height: canvas.height,
    hasAlpha,
    canvas,
  };
}

function canvasHasAlpha(canvas: OffscreenCanvas | HTMLCanvasElement): boolean {
  const context = require2dContext(canvas);
  const sample = context.getImageData(
    0,
    0,
    Math.min(canvas.width, 64),
    Math.min(canvas.height, 64),
  );
  for (let index = 3; index < sample.data.length; index += 4) {
    if ((sample.data[index] ?? 255) < 255) return true;
  }
  return false;
}

function makeCanvas(
  width: number,
  height: number,
): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas === "function") {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function createBrowserImageCodec(): ImageCodec {
  return {
    async decode(bytes, mime: InputImageMime) {
      const blob = new Blob([copyBytes(bytes)], { type: mime });
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(blob, {
          imageOrientation: "from-image",
        });
      } catch {
        throw new AssetValidationError(
          mime === "image/heic" || mime === "image/heif"
            ? "This browser cannot decode HEIC. Save the photo as JPEG or PNG and attach that."
            : "Chalk could not read that image.",
        );
      }
      const canvas = makeCanvas(bitmap.width, bitmap.height);
      const context = require2dContext(canvas);
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const hasAlpha = canvasHasAlpha(canvas);
      return rasterFromCanvas(canvas, hasAlpha);
    },
    resize(source, width, height) {
      const from = source as DecodedRaster & {
        canvas?: OffscreenCanvas | HTMLCanvasElement;
      };
      const canvas = makeCanvas(width, height);
      if (!from.canvas) {
        throw new AssetValidationError("Chalk could not read that image.");
      }
      const context = require2dContext(canvas);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(from.canvas, 0, 0, width, height);
      return Promise.resolve(rasterFromCanvas(canvas, source.hasAlpha));
    },
    async encode(source, mime: StoredImageMime, quality) {
      const from = source as DecodedRaster & {
        canvas?: OffscreenCanvas | HTMLCanvasElement;
      };
      if (!from.canvas) {
        throw new AssetValidationError("Chalk could not encode that image.");
      }
      const canvas = from.canvas;
      const type = mime;
      const qualityValue = mime === "image/png" ? undefined : quality;
      if ("convertToBlob" in canvas) {
        const blob = await canvas.convertToBlob({
          type,
          quality: qualityValue,
        });
        return new Uint8Array(await blob.arrayBuffer());
      }
      if (!("toBlob" in canvas)) {
        throw new AssetValidationError("Chalk could not encode that image.");
      }
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result: Blob | null) =>
            result
              ? resolve(result)
              : reject(
                  new AssetValidationError(
                    "Chalk could not encode that image.",
                  ),
                ),
          type,
          qualityValue ?? IMAGE_JPEG_QUALITY,
        );
      });
      return new Uint8Array(await blob.arrayBuffer());
    },
  };
}
