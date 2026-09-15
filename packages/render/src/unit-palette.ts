import type { PlayUnit } from "@chalk/domain";

/**
 * One accent and one tint per Unit — the only colour Chalk adds for
 * classification (ADR 0051). The accent paints a dot or a hairline, the tint
 * a chip's ground; ink stays the text colour, so every badge reads by its
 * word first and its colour second. The three were chosen apart from the
 * field's own semantics — route blue, blitz red, stunt orange, route green,
 * yellow, and the coverage fills — and checked against protan, deutan and
 * tritan simulation (`packages/render/src/unit-palette.test.ts`).
 */
export interface UnitColors {
  /** Dot and hairline. At least 3:1 against the tint, 4.5:1 against paper. */
  readonly accent: string;
  /** Chip ground. Ink on it is at least 15:1. */
  readonly tint: string;
}

export const unitPalette: Readonly<Record<PlayUnit, UnitColors>> =
  Object.freeze({
    offense: { accent: "#2e6bb0", tint: "#e6eff9" },
    defense: { accent: "#7a2e5a", tint: "#f6e6ef" },
    "special-teams": { accent: "#8a6a12", tint: "#f7f0dc" },
  });

/**
 * The status colours the shell reserves for actual state — a save that
 * failed, a shell that could not be prepared, a plan that is ready — and
 * never for navigation or decoration.
 */
export const statusPalette = Object.freeze({
  ready: { accent: "#2b6a3a", tint: "#e9f5ec" },
  warn: { accent: "#8a5a00", tint: "#fdf6e3" },
  error: { accent: "#c53b3f", tint: "#fdecec" },
});
