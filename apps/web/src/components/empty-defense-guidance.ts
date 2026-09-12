/**
 * When an offense-only Play should show the empty-defense field CTA.
 *
 * Pure predicate — no React, no side effects. Keeps the Coach's next move
 * (open the Defenses book) obvious without auto-applying a call.
 */

export type EmptyDefenseGuidanceView =
  | "Editor"
  | "Demo"
  | "Present"
  | "Print";

export type EmptyDefenseGuidancePlayer = {
  readonly unit: "offense" | "defense" | "special-teams";
};

export type EmptyDefenseGuidanceInput = {
  readonly view: EmptyDefenseGuidanceView;
  /** Any open modal (Defenses, Formations, palette, …) hides the CTA. */
  readonly overlayOpen: boolean;
  /** Playback scrub hides the CTA so it does not sit on top of the run. */
  readonly animating: boolean;
  readonly players: readonly EmptyDefenseGuidancePlayer[];
};

export type EmptyDefenseGuidance = {
  readonly show: boolean;
  readonly defenderCount: number;
  readonly nonDefenseCount: number;
};

export function emptyDefenseGuidance(
  input: EmptyDefenseGuidanceInput,
): EmptyDefenseGuidance {
  const defenderCount = input.players.reduce(
    (count, player) => (player.unit === "defense" ? count + 1 : count),
    0,
  );
  const nonDefenseCount = input.players.length - defenderCount;

  const show =
    input.view === "Editor" &&
    !input.overlayOpen &&
    !input.animating &&
    defenderCount === 0 &&
    nonDefenseCount > 0;

  return { show, defenderCount, nonDefenseCount };
}
