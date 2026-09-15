import { unitName, type PlayUnit } from "@chalk/domain";

/**
 * The Unit as a small labeled chip — Offense, Defense, Special teams — in
 * its accent on its tint, the same on a library card, a game plan, the
 * Game Day reader and a printed page (ADR 0051). The word is always there;
 * the colour and the dot only make it quicker to pick out, so a grayscale
 * copy or a Coach who cannot tell the hues apart loses nothing.
 */
export function UnitBadge({ unit }: { readonly unit: PlayUnit }) {
  return (
    <span className="unit-badge" data-unit={unit}>
      <i aria-hidden="true" />
      {unitName(unit)}
    </span>
  );
}
