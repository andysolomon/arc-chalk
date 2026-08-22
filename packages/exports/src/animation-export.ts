import {
  formatPlaybackClock,
  frameSequenceTimes,
  planPlay,
  playKeyFrames,
  PRODUCT_NAME,
  type PlayDocument,
  type PlayKeyFrame,
} from "@chalk/domain";

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function playFileBase(playName: string): string {
  return (
    (playName || "play")
      .replace(/[^\w\- ]/g, "")
      .trim()
      .replace(/\s+/g, "-") || "play"
  );
}

export function padFrameIndex(index: number): string {
  return index < 10 ? `0${index}` : String(index);
}

/**
 * The numbered PNG list a Coach gets with the frame sequence. Times are
 * relative to the snap, matching the scrubber clock.
 */
export function frameSequenceManifest(play: PlayDocument): string {
  const plan = planPlay(play);
  const times = frameSequenceTimes(plan);
  const base = playFileBase(play.name);
  const header = [
    `${play.name || "Play"} — frame sequence`,
    PRODUCT_NAME,
    `0.2s per frame, snap at ${formatPlaybackClock(0)} of ${formatPlaybackClock(plan.endMs)}`,
    "",
  ];
  const rows = times.map(
    (atMs, index) =>
      `${padFrameIndex(index + 1)}  ${base}-${padFrameIndex(index + 1)}.png  ${formatPlaybackClock(atMs)}`,
  );
  return [...header, ...rows].join("\n");
}

export function frameSequenceName(playName: string, index: number): string {
  return `${playFileBase(playName)}-${padFrameIndex(index)}.png`;
}

const PROGRESSION_CSS =
  "@page{size:letter landscape;margin:0.45in}" +
  ".hd{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}" +
  ".hd h1{font-size:19px;margin:0;font-weight:600}" +
  ".hd span{font-size:11px;color:#8F8F8F;font-family:ui-monospace,Menlo,monospace}" +
  ".row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}" +
  ".fr{border:1px solid rgba(0,0,0,0.08);border-radius:6px;overflow:hidden;background:#fff}" +
  ".fr svg{width:100%;height:auto;display:block}" +
  ".cap{display:flex;justify-content:space-between;align-items:baseline;padding:8px 10px;border-top:1px solid rgba(0,0,0,0.08)}" +
  ".cap b{font-size:12px;font-weight:600}" +
  ".cap span{font-size:11px;color:#8F8F8F;font-family:ui-monospace,Menlo,monospace}";

const FIELD_CSS =
  ".field-paper{fill:#fff;stroke:#e5e5e5}" +
  ".field-grid{stroke:#e7e7e7;stroke-width:1}" +
  ".hash{stroke:#ececec;stroke-width:1}" +
  ".line-of-scrimmage{stroke:#4d4d4d;stroke-width:2}" +
  '.yard-numbers{fill:#e9e9e9;font-family:"Geist Mono",ui-monospace,Menlo,monospace;font-size:26px;font-weight:600}' +
  ".yard-numbers text{text-anchor:middle}";

export interface ProgressionStripFrame {
  readonly name: string;
  readonly clock: string;
  readonly svgMarkup: string;
}

export function progressionStripFrames(
  play: PlayDocument,
): readonly PlayKeyFrame[] {
  return playKeyFrames(play);
}

export function progressionStripHtml(options: {
  readonly playName: string;
  readonly frames: readonly ProgressionStripFrame[];
  readonly productName?: string;
}): string {
  const product = options.productName ?? PRODUCT_NAME;
  const title = `${options.playName || "Play"} — progression`;
  const cells = options.frames
    .map(
      (frame) =>
        `<div class="fr">${frame.svgMarkup}` +
        `<div class="cap"><b>${escapeHtml(frame.name)}</b>` +
        `<span>${escapeHtml(frame.clock)}</span></div></div>`,
    )
    .join("");
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<title>${escapeHtml(title)} \u2014 ${escapeHtml(product)}</title>` +
    "<style>*{box-sizing:border-box}body{margin:0;padding:0.2in;font-family:Helvetica,Arial,sans-serif;" +
    "color:#171717;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    PROGRESSION_CSS +
    FIELD_CSS +
    "</style></head><body>" +
    `<div class="hd"><h1>${escapeHtml(title)}</h1><span>${escapeHtml(product)}</span></div>` +
    `<div class="row">${cells}</div>` +
    "</body></html>"
  );
}
