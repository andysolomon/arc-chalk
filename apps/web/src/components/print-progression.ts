import { frameSequenceTimes, planPlay, type PlayDocument } from "@chalk/domain";
import {
  frameSequenceManifest,
  frameSequenceName,
  progressionStripHtml,
  progressionStripFrames,
} from "@chalk/exports";

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
  const popup = open("", "_blank");
  if (!popup) return;
  popup.document.write(progressionStripHtml({ playName: play.name, frames }));
  popup.document.close();
  globalThis.setTimeout(() => {
    try {
      popup.focus();
      popup.print();
    } catch {
      // A blocked print dialog is a no-op, as the original's is.
    }
  }, 400);
}

function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function pngFromSvg(svgMarkup: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const wrapped = svgMarkup.includes("xmlns=")
      ? svgMarkup
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 620">${svgMarkup}</svg>`;
    const image = new Image();
    const url = URL.createObjectURL(
      new Blob([wrapped], { type: "image/svg+xml;charset=utf-8" }),
    );
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 620;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not draw the frame."));
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Could not encode the frame."));
          return;
        }
        resolve(blob);
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the frame."));
    };
    image.src = url;
  });
}

export async function downloadFrameSequence(
  play: PlayDocument,
  svgForPlay: (atMs: number) => string,
): Promise<number> {
  const plan = planPlay(play);
  const times = frameSequenceTimes(plan);
  if (times.length === 0) return 0;
  downloadBlob(
    `${play.name || "play"}-frames.txt`.replace(/\s+/g, "-"),
    new Blob([frameSequenceManifest(play)], { type: "text/plain" }),
  );
  let index = 0;
  for (const atMs of times) {
    index += 1;
    const blob = await pngFromSvg(svgForPlay(atMs));
    downloadBlob(frameSequenceName(play.name, index), blob);
    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, 260);
    });
  }
  return times.length;
}
