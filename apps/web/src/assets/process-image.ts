import {
  AssetValidationError,
  normalizeImage,
  type NormalizedImage,
} from "@chalk/domain";

import { createBrowserImageCodec } from "./browser-codec";
import type { ImageWorkerResponse } from "./process-image.worker";

export async function processImageBytes(
  bytes: Uint8Array,
): Promise<NormalizedImage> {
  return normalizeImage(bytes, createBrowserImageCodec());
}

let worker: Worker | undefined;
let nextWorkerId = 1;
const pending = new Map<
  number,
  {
    resolve: (image: NormalizedImage) => void;
    reject: (error: Error) => void;
  }
>();

function workerSupported(): boolean {
  return typeof Worker === "function" && typeof OffscreenCanvas === "function";
}

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./process-image.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (event: MessageEvent<ImageWorkerResponse>) => {
    const job = pending.get(event.data.id);
    if (!job) return;
    pending.delete(event.data.id);
    if (event.data.ok) job.resolve(event.data.image);
    else job.reject(new AssetValidationError(event.data.message));
  };
  worker.onerror = () => {
    for (const job of pending.values()) {
      job.reject(new AssetValidationError("Chalk could not read that image."));
    }
    pending.clear();
    worker?.terminate();
    worker = undefined;
  };
  return worker;
}

function processInWorker(bytes: Uint8Array): Promise<NormalizedImage> {
  const copy = bytes.slice().buffer;
  const id = nextWorkerId;
  nextWorkerId += 1;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ensureWorker().postMessage({ id, bytes: copy }, [copy]);
  });
}

/**
 * Decode, orient, strip EXIF, resize, thumbnail, and hash. Uses a Worker
 * where OffscreenCanvas exists so the editor thread is not blocked (ADR 0031).
 */
export async function processImageFile(file: File): Promise<NormalizedImage> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (workerSupported()) {
    try {
      return await processInWorker(bytes);
    } catch (error) {
      if (error instanceof AssetValidationError) throw error;
    }
  }
  return processImageBytes(bytes);
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function blobsFromNormalized(image: NormalizedImage): {
  blob: Blob;
  thumbnail: Blob;
} {
  return {
    blob: new Blob([copyBytes(image.bytes)], { type: image.mimeType }),
    thumbnail: new Blob([copyBytes(image.thumbnailBytes)], {
      type: image.thumbnailMimeType,
    }),
  };
}
