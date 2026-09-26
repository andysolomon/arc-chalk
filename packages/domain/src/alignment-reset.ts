import { ballSpotMapping, currentBallSpot, hashSpots } from "./ball-spot";
import { type DefensiveCall, stockDefensiveCalls } from "./defense-catalogue";
import { stockFormations } from "./formation-catalogue";
import {
  applyFormation,
  moveMenWithTheirLines,
  offensivePlayers,
  planRealignment,
  playersOnSideOfBall,
  type PlayerSideOfBall,
} from "./formations";
import { realignManCoverage } from "./man-coverage";
import type {
  Coordinate,
  Formation,
  FormationSlot,
  PlayDocument,
  Player,
} from "./schema";

/**
 * Putting the men back. A Coach who has dragged his men about can return one
 * side of the ball to the set or call he chose for it, or — when he never
 * chose one, or wants a clean start — to the base alignment. Either way the
 * men move rather than being replaced: every route, drop and note travels
 * with the man it belongs to, exactly as it does when a set is applied.
 */

/** What the men go back to: what the Coach chose, or the base alignment. */
export type AlignmentResetTarget = "chosen" | "base";

const stock = (id: string): Formation => {
  const formation =
    stockFormations.find((value) => value.id === id) ??
    stockDefensiveCalls.find(({ formation: value }) => value.id === id)
      ?.formation;
  if (!formation) throw new Error(`No stock alignment ${id}`);
  return formation;
};

/**
 * The alignments every Playbook falls back to: two-by-two from the gun on
 * offense, and a four-man front with three deep on defense — the first set
 * and the first call the browsers list, and the looks a staff installs first.
 */
export const baseFormation: Formation = stock("formation_gun_doubles_right");
export const baseDefensiveCall: Formation = stock("defense_43_c3");

/**
 * `calls` is the defensive catalogue as the Coach's Playbook stands it —
 * corners and deep safeties at his depths (ADR 0061) — so base is too.
 */
export function baseAlignment(
  side: PlayerSideOfBall,
  calls: readonly DefensiveCall[] = stockDefensiveCalls,
): Formation {
  if (side === "offense") return baseFormation;
  return (
    calls.find(({ formation }) => formation.id === baseDefensiveCall.id)
      ?.formation ?? baseDefensiveCall
  );
}

/**
 * The set or call the Coach put this side of the ball in, if the Play still
 * remembers one the catalogue has. A call is read from the stock calls, since
 * those are the only ones a Coach can put on the field.
 */
export function chosenAlignment(
  play: PlayDocument,
  side: PlayerSideOfBall,
  formations: readonly Formation[] = stockFormations,
  calls: readonly DefensiveCall[] = stockDefensiveCalls,
): Formation | undefined {
  if (side === "defense") {
    const callId = play.defensiveCallSource?.callId;
    return calls.find(({ formation }) => formation.id === callId)?.formation;
  }
  const formationId = play.formationSource?.formationId;
  return formations.find(({ id }) => id === formationId);
}

interface Pairing {
  readonly player: Player;
  readonly slot: FormationSlot;
}

/** The men the Play already says stand in which of the chosen slots. */
function boundPairs(
  play: PlayDocument,
  side: PlayerSideOfBall,
  alignment: Formation,
): Pairing[] {
  const bindings =
    side === "defense"
      ? play.defensiveCallSource?.slotBindings
      : play.formationSource?.slotBindings;
  const men = new Map(
    playersOnSideOfBall(play, side).map((player) => [player.id, player]),
  );
  const slots = new Map(alignment.slots.map((slot) => [slot.id, slot]));
  return (bindings ?? []).flatMap(({ playerId, slotId }) => {
    const player = men.get(playerId);
    const slot = slots.get(slotId);
    return player && slot ? [{ player, slot }] : [];
  });
}

/**
 * A defender has no role to read off a hand-drawn front — his letter is what
 * says what he plays. Each slot takes the nearest man wearing its letter, the
 * closest pairs settled first, so two corners go to the corner spots on their
 * own sides rather than in the order they happen to be listed.
 */
function pairByLetter(
  men: readonly Player[],
  slots: readonly FormationSlot[],
): Pairing[] {
  const letter = (label: string) => label.trim().toUpperCase();
  const candidates = slots.flatMap((slot) =>
    men
      .filter((player) => letter(player.label) === letter(slot.label))
      .map((player) => ({
        player,
        slot,
        gap: Math.hypot(
          player.position.lateralYards - slot.position.lateralYards,
          player.position.depthYards - slot.position.depthYards,
        ),
      })),
  );
  candidates.sort((left, right) => left.gap - right.gap);
  const takenMen = new Set<string>();
  const takenSlots = new Set<string>();
  const pairs: Pairing[] = [];
  for (const { player, slot } of candidates) {
    if (takenMen.has(player.id) || takenSlots.has(slot.id)) continue;
    takenMen.add(player.id);
    takenSlots.add(slot.id);
    pairs.push({ player, slot });
  }
  return pairs;
}

/** How near the ball a man stands and still has no split to be squeezed. */
const MIN_SPLIT_YARDS = 0.5;
/** Two readings this close are the same reading. */
const SAME_READING = 1e-6;

/**
 * Where each slot stands on the field now. Sets and calls are drawn from a
 * ball in the middle of the field; a Coach who spotted it on a hash and then
 * moved a man wants him back on that hash, with the split the hash left him,
 * not the whole side dragged back to the middle.
 *
 * The men he has not moved say how the alignment was placed. The ball is
 * where the set was drawn or on one of the three spots, and spotting it
 * squeezes each side of it by one factor, so a man still in his slot agrees
 * with every other one on his side about that factor. Whichever ball the most
 * men agree on is the ball, and the factor they agree on is the squeeze — so
 * the man or two he dragged, the centre among them, do not move the rest.
 * When too few agree to say, the centre does, as it does for the Ball on
 * control; a side nobody speaks for is squeezed as spotting the ball would.
 */
function placeSlots(
  play: PlayDocument,
  alignment: Formation,
  pairs: readonly Pairing[],
): Map<string, Coordinate> {
  const own = alignment.ball.position.lateralYards;
  const split = (slot: FormationSlot) => slot.position.lateralYards - own;
  const reading = (ball: number) => {
    const side = (sign: 1 | -1) => {
      const factors = pairs
        .filter(({ slot }) => sign * split(slot) > MIN_SPLIT_YARDS)
        .map(
          ({ player, slot }) =>
            (player.position.lateralYards - ball) / split(slot),
        );
      let best: { factor: number; agree: number } | undefined;
      for (const factor of factors) {
        const agree = factors.filter(
          (other) => Math.abs(other - factor) < SAME_READING,
        ).length;
        if (!best || agree > best.agree) best = { factor, agree };
      }
      return best && best.agree >= 2 ? best : undefined;
    };
    const left = side(-1);
    const right = side(1);
    const onTheBall = pairs.filter(
      ({ player, slot }) =>
        split(slot) === 0 &&
        Math.abs(player.position.lateralYards - ball) < SAME_READING,
    ).length;
    return {
      ball,
      agree: (left?.agree ?? 0) + (right?.agree ?? 0) + onTheBall,
      leftFactor: left?.factor,
      rightFactor: right?.factor,
    };
  };

  const spots = hashSpots(play);
  const read = [own, spots.left, spots.middle, spots.right]
    .map(reading)
    .reduce((best, next) => (next.agree > best.agree ? next : best));
  const spot =
    offensivePlayers(play).length > 0 ? currentBallSpot(play) : undefined;
  const ball =
    read.agree >= 2 ? read.ball : spot === undefined ? own : spots[spot];

  const mapping =
    ball === own
      ? undefined
      : ballSpotMapping(
          {
            ...play,
            players: alignment.slots.map((slot) => ({
              id: slot.id,
              unit: slot.unit,
              position: slot.position,
              symbol: slot.symbol,
              label: slot.label,
              sublabel: slot.sublabel,
              fill: slot.fill,
              color: slot.color,
            })),
          },
          ball,
        );
  const agreed = read.ball === ball ? read : undefined;
  const leftFactor = agreed?.leftFactor ?? mapping?.leftScale ?? 1;
  const rightFactor = agreed?.rightFactor ?? mapping?.rightScale ?? 1;

  const standing = new Map(
    pairs.map(({ player, slot }) => [slot.id, player.position]),
  );
  return new Map(
    alignment.slots.map((slot) => {
      const offset = split(slot);
      const placed: Coordinate = {
        lateralYards: ball + offset * (offset < 0 ? leftFactor : rightFactor),
        depthYards: slot.position.depthYards,
      };
      // Reading the placement back off the men is arithmetic, and a man who
      // never moved is not nudged by its rounding.
      const now = standing.get(slot.id);
      return [
        slot.id,
        now &&
        Math.abs(now.lateralYards - placed.lateralYards) < SAME_READING &&
        Math.abs(now.depthYards - placed.depthYards) < SAME_READING
          ? now
          : placed,
      ];
    }),
  );
}

export interface AlignmentReset {
  readonly play: PlayDocument;
  /** The set or call the men were put back in. */
  readonly alignment: Formation;
  /** How many men stand somewhere else now. */
  readonly movedCount: number;
}

/**
 * Puts one side of the ball back in the set or call the Coach chose for it,
 * or in the base alignment. Nothing to go back to — no choice remembered, or
 * nobody on that side the alignment has a place for — is no reset at all.
 *
 * Going back to what he chose moves the men the Play still remembers in each
 * slot and changes nothing else about it. Going to base is choosing it: the
 * offense is realigned into the base set by role, without adding anyone, and
 * the defense is put in the base call letter by letter; either way the Play
 * then remembers base as what that side is in. A man the alignment has no
 * place for stays exactly where he is.
 */
export function resetAlignment(
  play: PlayDocument,
  side: PlayerSideOfBall,
  target: AlignmentResetTarget,
  formations: readonly Formation[] = stockFormations,
  calls: readonly DefensiveCall[] = stockDefensiveCalls,
): AlignmentReset | undefined {
  const alignment =
    target === "chosen"
      ? chosenAlignment(play, side, formations, calls)
      : baseAlignment(side, calls);
  if (!alignment) return undefined;

  const pairs =
    target === "chosen"
      ? boundPairs(play, side, alignment)
      : side === "defense"
        ? pairByLetter(playersOnSideOfBall(play, side), alignment.slots)
        : planRealignment(play, alignment).pairs.map(({ playerId, slot }) => ({
            player: play.players.find(({ id }) => id === playerId)!,
            slot,
          }));
  if (pairs.length === 0) return undefined;

  const placed = placeSlots(play, alignment, pairs);
  const movedCount = pairs.filter(
    ({ player, slot }) => placed.get(slot.id) !== player.position,
  ).length;

  if (target === "base" && side === "offense") {
    // A reset moves the men who are there and adds nobody, so no ids are
    // ever asked for.
    const { play: aligned } = applyFormation(
      play,
      {
        ...alignment,
        slots: alignment.slots.map((slot) => ({
          ...slot,
          position: placed.get(slot.id)!,
        })),
      },
      () => "",
      { addMissingPlayers: false },
    );
    return { play: aligned, alignment, movedCount };
  }

  const carried = moveMenWithTheirLines(
    play,
    new Map(pairs.map(({ player, slot }) => [player.id, placed.get(slot.id)!])),
  );
  if (side === "offense") return { alignment, movedCount, play: carried };

  // A defender in man goes back where the call puts him: in Cover 0 that is
  // on his man (ADR 0060), and in any other call on his slot (ADR 0061).
  const moved = realignManCoverage(carried);
  const at = new Map(moved.players.map(({ id, position }) => [id, position]));
  return {
    alignment,
    movedCount: pairs.filter(({ player }) => {
      const now = at.get(player.id)!;
      return (
        now.lateralYards !== player.position.lateralYards ||
        now.depthYards !== player.position.depthYards
      );
    }).length,
    play:
      target === "base"
        ? {
            ...moved,
            defensiveCallSource: {
              callId: alignment.id,
              slotBindings: pairs.map(({ player, slot }) => ({
                slotId: slot.id,
                playerId: player.id,
              })),
            },
          }
        : moved,
  };
}
