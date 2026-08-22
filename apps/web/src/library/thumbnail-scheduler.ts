import {
  PLAY_THUMBNAIL_RENDERER_VERSION,
  playThumbnailKey,
  type PlayThumbnailTheme,
} from "@chalk/domain";
import type {
  PlaySearchProjection,
  ThumbnailDerivative,
} from "@chalk/local-db";

import type { ChalkLibrary } from "../app/editor-runtime";
import { playThumbnailBlob } from "./play-thumbnail";

export interface ThumbnailRequest {
  readonly playId: string;
  readonly documentHash: string;
  readonly fieldProfileRevision?: number;
  readonly theme?: PlayThumbnailTheme;
}

/**
 * Lazy, cancelable, revision-keyed thumbnails. Generation waits for idle time
 * and never holds a Play's geometry in the library list.
 */
export function createThumbnailScheduler(library: ChalkLibrary): {
  urlFor(
    request: ThumbnailRequest,
    signal?: AbortSignal,
  ): Promise<string | undefined>;
  dispose(): void;
} {
  const inflight = new Map<string, Promise<string | undefined>>();
  const urls = new Map<string, string>();

  const keyOf = (request: ThumbnailRequest): string =>
    playThumbnailKey({
      playId: request.playId,
      revisionHash: request.documentHash,
      rendererVersion: PLAY_THUMBNAIL_RENDERER_VERSION,
      fieldProfileRevision: request.fieldProfileRevision ?? 0,
      theme: request.theme ?? "light",
    });

  const remember = (key: string, blob: Blob): string => {
    const previous = urls.get(key);
    if (previous) URL.revokeObjectURL(previous);
    const url = URL.createObjectURL(blob);
    urls.set(key, url);
    return url;
  };

  const waitForIdle = (signal?: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const finish = () => resolve();
      const onAbort = () => {
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      const idle = (
        globalThis as { requestIdleCallback?: (cb: () => void) => number }
      ).requestIdleCallback;
      if (typeof idle === "function") {
        idle(() => {
          signal?.removeEventListener("abort", onAbort);
          finish();
        });
        return;
      }
      const timer = globalThis.setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        finish();
      }, 16);
      signal?.addEventListener("abort", () => globalThis.clearTimeout(timer), {
        once: true,
      });
    });

  const generate = async (
    request: ThumbnailRequest,
    signal?: AbortSignal,
  ): Promise<string | undefined> => {
    const key = keyOf(request);
    const cached = urls.get(key);
    if (cached) return cached;
    const stored = await library.getThumbnail(key);
    if (signal?.aborted) return undefined;
    if (stored) return remember(key, stored.blob);
    await waitForIdle(signal);
    if (signal?.aborted) return undefined;
    const play = await library.getPlay(request.playId);
    if (!play || signal?.aborted) return undefined;
    const blob = playThumbnailBlob(play.document);
    const derivative: ThumbnailDerivative = {
      key,
      playId: request.playId,
      revisionHash: request.documentHash,
      rendererVersion: PLAY_THUMBNAIL_RENDERER_VERSION,
      fieldProfileRevision:
        request.fieldProfileRevision ?? play.document.fieldProfile.revision,
      theme: request.theme ?? "light",
      blob,
      createdAtMs: Date.now(),
    };
    await library.putThumbnail(derivative);
    if (signal?.aborted) return undefined;
    return remember(key, blob);
  };

  return {
    urlFor(request, signal) {
      const key = keyOf(request);
      const cached = urls.get(key);
      if (cached) return Promise.resolve(cached);
      const running = inflight.get(key);
      if (running) return running;
      const work = generate(request, signal)
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return undefined;
          }
          throw error;
        })
        .finally(() => {
          inflight.delete(key);
        });
      inflight.set(key, work);
      return work;
    },
    dispose() {
      inflight.clear();
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}

export function thumbnailRequestFrom(
  member: PlaySearchProjection,
): ThumbnailRequest {
  return {
    playId: member.playId,
    documentHash: member.documentHash,
    ...(member.fieldProfileRevision === undefined
      ? {}
      : { fieldProfileRevision: member.fieldProfileRevision }),
  };
}
