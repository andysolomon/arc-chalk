import { frameSequenceTimes, planPlay, type PlayDocument } from "@chalk/domain";
import {
  frameSequenceManifest,
  frameSequenceName,
  playFileBase,
  progressionStripHtml,
  progressionStripFrames,
  standaloneSvg,
} from "@chalk/exports";

import { downloadBlob, downloadText, pngFromSvg } from "./export-files";
import { openPrintWindow } from "./print-window";

export function openProgressionStrip(
  play: PlayDocument,
  svgForPlay: (atMs: number) => string,
  open: typeof globalThis.open = (...args) => globalThis.open(...args),
): void {
  const frames = progressionStripFrames(play).map((frame) => ({
    name: frame.name,
    clock: frame.clock,
    svgMarkup: svgForPlay(frame.atMs),
  }));
  if (frames.length === 0) return;
  openPrintWindow(progressionStripHtml({ playName: play.name, frames }), open);
}

/**
 * A numbered PNG every 0.2s plus a manifest — drop the folder into any video
 * tool. Each frame is the same 2000×1240 still the PNG export writes.
 */
export async function downloadFrameSequence(
  play: PlayDocument,
  svgForPlay: (atMs: number) => string,
): Promise<number> {
  const plan = planPlay(play);
  const times = frameSequenceTimes(plan);
  if (times.length === 0) return 0;
  downloadText(
    `${playFileBase(play.name)}-frames.txt`,
    frameSequenceManifest(play),
    "text/plain",
  );
  let index = 0;
  for (const atMs of times) {
    index += 1;
    const blob = await pngFromSvg(standaloneSvg(svgForPlay(atMs)));
    downloadBlob(frameSequenceName(play.name, index), blob);
    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, 260);
    });
  }
  return times.length;
}
