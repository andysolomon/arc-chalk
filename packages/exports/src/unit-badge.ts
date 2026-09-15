import {
  CLASSIFICATION_SEPARATOR,
  playUnits,
  unitName,
  type PlayClassification,
  type PlayUnit,
} from "@chalk/domain";
import { unitPalette } from "@chalk/render";

const escape = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * The Unit as a small labeled badge on paper — the same word the header
 * pill, a card and a chip carry, in the Unit's accent on its tint with a
 * hairline (ADR 0051). The word does the work: under the monochrome option
 * the whole document is desaturated and the badge reads as a bordered
 * label, and a copier keeps it the same way.
 */
export function unitBadgeHtml(unit: PlayUnit): string {
  return `<span class="ub" data-unit="${unit}">${escape(unitName(unit))}</span>`;
}

/** `Offense · Pass` with the Unit as a badge; the Type stays plain text. */
export function classificationHtml(play: PlayClassification): string {
  const type = play.playType?.name.trim();
  return (
    unitBadgeHtml(play.unit) +
    (type ? `${CLASSIFICATION_SEPARATOR}${escape(type)}` : "")
  );
}

/** The badge's rules, included in every printed document's stylesheet. */
export const UNIT_BADGE_CSS: string =
  ".ub{display:inline-block;vertical-align:baseline;font-size:8px;line-height:12px;letter-spacing:0.6px;text-transform:uppercase;font-weight:600;font-family:ui-monospace,Menlo,monospace;border:1px solid currentColor;border-radius:3px;padding:0 4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
  playUnits
    .map(
      ({ id }) =>
        `.ub[data-unit="${id}"]{color:${unitPalette[id].accent};background:${unitPalette[id].tint}}`,
    )
    .join("");
