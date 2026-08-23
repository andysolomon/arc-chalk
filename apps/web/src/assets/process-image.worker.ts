import {
  AssetValidationError,
  normalizeImage,
  type NormalizedImage,
} from "@chalk/domain";

import { createBrowserImageCodec } from "./browser-codec";

export interface ImageWorkerRequest {
  readonly id: number;
  readonly bytes: ArrayBuffer;
}

export type ImageWorkerResponse =
  | { readonly id: number; readonly ok: true; readonly image: NormalizedImage }
  | { readonly id: number; readonly ok: false; readonly message: string };

interface ImageWorkerScope {
  onmessage: ((event: MessageEvent<ImageWorkerRequest>) => void) | null;
  postMessage(message: ImageWorkerResponse, transfer?: Transferable[]): void;
}

const workerScope = self as unknown as ImageWorkerScope;

workerScope.onmessage = (event: MessageEvent<ImageWorkerRequest>) => {
  const { id, bytes } = event.data;
  void normalizeImage(new Uint8Array(bytes), createBrowserImageCodec())
    .then((image) => {
      const response: ImageWorkerResponse = { id, ok: true, image };
      workerScope.postMessage(response, [
        image.bytes.buffer as ArrayBuffer,
        image.thumbnailBytes.buffer as ArrayBuffer,
      ]);
    })
    .catch((error: unknown) => {
      const message =
        error instanceof AssetValidationError
          ? error.message
          : "Chalk could not read that image.";
      const response: ImageWorkerResponse = { id, ok: false, message };
      workerScope.postMessage(response);
    });
};
