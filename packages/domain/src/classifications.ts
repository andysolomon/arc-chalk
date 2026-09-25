import { LEGACY_FIELD_GEOMETRY, legacyCanvasToYards } from "./geometry";
import {
  playTypeDefinitionSchema,
  type Color,
  type LabelBox,
  type LabelRole,
  type LegacyPlayType,
  type MovementPath,
  type PathStyle,
  type Player,
  type PlayTypeDefinition,
  type PlayTypeReference,
} from "./schema";

/**
 * What each kind of label means on a Play, and how the original draws it. A
 * Coach picks the meaning — Landmark, Alert — and the appearance follows,
 * so the same idea reads the same way on every card he prints.
 */
export interface LabelRolePreset {
  readonly name: string;
  readonly color: Color;
  readonly box: LabelBox;
  readonly boxColor: Color;
  readonly size: number;
  readonly mono: boolean;
  readonly caps: boolean;
}

export const labelRolePresets: Readonly<Record<LabelRole, LabelRolePreset>> =
  Object.freeze({
    landmark: {
      name: "Landmark",
      color: "green",
      box: "none",
      boxColor: "yellow",
      size: 11,
      mono: true,
      caps: false,
    },
    assignment: {
      name: "Assignment",
      color: "ink",
      box: "none",
      boxColor: "yellow",
      size: 11,
      mono: true,
      caps: true,
    },
    progression: {
      name: "Progression",
      color: "blue",
      box: "circle",
      boxColor: "blue",
      size: 12,
      mono: false,
      caps: false,
    },
    adjustment: {
      name: "Adjustment",
      color: "ink",
      box: "fill",
      boxColor: "yellow",
      size: 11,
      mono: false,
      caps: true,
    },
    alert: {
      name: "Alert",
      color: "red",
      box: "outline",
      boxColor: "red",
      size: 12,
      mono: false,
      caps: true,
    },
    coaching: {
      name: "Coaching point",
      color: "ink",
      box: "outline",
      boxColor: "ink",
      size: 11,
      mono: false,
      caps: false,
    },
  });

/**
 * What each kind of line looks like when a Coach changes a route into it.
 * Some of it is fixed — a blitz is red, a stunt runs on chevrons — and some
 * defers to what he already chose, so changing a block back into a route
 * keeps his ending unless that ending only made sense as a block.
 */
export function routeKindStyle(
  kind: MovementPath["kind"],
  current: PathStyle,
): PathStyle {
  switch (kind) {
    case "route":
      return {
        line: "solid",
        ending:
          current.ending === "bar" || current.ending === "bubble"
            ? "arrow"
            : current.ending,
        color: current.color,
      };
    case "motion":
      return { line: "zigzag", ending: "arrow", color: current.color };
    case "block":
      return { line: "solid", ending: "bar", color: current.color };
    case "zone":
      return {
        line: "dashed",
        ending: "bubble",
        color: current.color === "ink" ? "blue" : current.color,
      };
    case "blitz":
      return { line: "solid", ending: "arrow", color: "red" };
    case "stunt":
      return { line: "solid", ending: "chevron", color: "orange" };
    case "ball":
      return { line: "dotted", ending: "arrow", color: "gray" };
  }
}

/**
 * The lines only a defender draws. A ball flight belongs to neither side —
 * the throw is part of the concept and part of what the call is defending —
 * so it is never claimed by kind alone.
 */
export const defensiveLineKinds: ReadonlySet<MovementPath["kind"]> =
  Object.freeze(new Set<MovementPath["kind"]>(["zone", "blitz", "stunt"]));

/**
 * Where the original puts the offensive line, and how far off it a man can
 * stand and still be one of them.
 */
const LINEMAN_DEPTH_YARDS = legacyCanvasToYards({
  x: LEGACY_FIELD_GEOMETRY.midfieldX,
  y: 448,
}).depthYards;
const LINEMAN_DEPTH_TOLERANCE_YARDS = legacyCanvasToYards({
  x: LEGACY_FIELD_GEOMETRY.midfieldX,
  y: LEGACY_FIELD_GEOMETRY.lineOfScrimmageY - 14,
}).depthYards;

/** The letters that name a spot on the offensive line. */
const LINE_LETTERS: ReadonlySet<string> = new Set([
  "LT",
  "LG",
  "C",
  "RG",
  "RT",
]);

/**
 * Who is on the line. The original reads this off where a man stands rather
 * than off a role he was given — an offensive player with no letter on him,
 * level with the ball, is a lineman — and production keeps the same rule
 * because the same Plays feed it: a formation carries positions, not roles.
 * A man the Coach lettered for a spot on the line — LT, LG, C, RG, RT — is a
 * lineman wherever he stands, since the Coach said so. What it decides is
 * what the Coach is offered, since a lineman blocks and has no route to run.
 */
export function isLineman(
  player: Pick<Player, "unit" | "label" | "position">,
): boolean {
  if (player.unit === "defense") return false;
  const letter = player.label.trim().toUpperCase();
  if (LINE_LETTERS.has(letter)) return true;
  return (
    letter === "" &&
    Math.abs(player.position.depthYards - LINEMAN_DEPTH_YARDS) <
      LINEMAN_DEPTH_TOLERANCE_YARDS
  );
}

/** What each kind of line is called where a Coach picks one. */
export const lineKindNames: Readonly<Record<MovementPath["kind"], string>> =
  Object.freeze({
    route: "Route",
    motion: "Motion",
    block: "Block",
    zone: "Zone",
    blitz: "Blitz",
    stunt: "Stunt",
    ball: "Ball",
  });

const DEFENDER_LINE_KINDS: readonly MovementPath["kind"][] = Object.freeze([
  "zone",
  "blitz",
  "stunt",
]);
const LINEMAN_LINE_KINDS: readonly MovementPath["kind"][] = Object.freeze([
  "block",
]);
const SKILL_LINE_KINDS: readonly MovementPath["kind"][] = Object.freeze([
  "route",
  "motion",
  "block",
  "ball",
]);

/**
 * The lines a man can be given, read off who he is rather than off the Play
 * he is drawn on. A defender drops, blitzes and stunts — he never runs a
 * route. A lineman blocks and does nothing else. Every other offensive man
 * runs, motions, blocks and carries the ball's flight, and nobody on offense
 * drops into a zone or blitzes. In the order a Coach is offered them.
 */
export function lineKindsFor(
  player: Pick<Player, "unit" | "label" | "position">,
): readonly MovementPath["kind"][] {
  if (player.unit === "defense") return DEFENDER_LINE_KINDS;
  if (isLineman(player)) return LINEMAN_LINE_KINDS;
  return SKILL_LINE_KINDS;
}

/** Whether this man can be given a line of this kind. */
export function canRunLine(
  player: Pick<Player, "unit" | "label" | "position">,
  kind: MovementPath["kind"],
): boolean {
  return lineKindsFor(player).includes(kind);
}

/** The sizes the original offers, and the text it labels them with. */
export const labelSizeChoices = Object.freeze([
  { name: "S", size: 11 },
  { name: "M", size: 13 },
  { name: "L", size: 17 },
]);

/** A new label the Coach has not written yet, as the original creates it. */
export const NEW_LABEL_DEFAULTS: {
  readonly text: string;
  readonly color: Color;
  readonly size: number;
  readonly box: LabelBox;
  readonly boxColor: Color;
} = Object.freeze({
  text: "5 Yds",
  color: "ink",
  size: 13,
  box: "none",
  boxColor: "yellow",
});

const definition = (
  value: Omit<PlayTypeDefinition, "archived">,
): PlayTypeDefinition =>
  playTypeDefinitionSchema.parse({ ...value, archived: false });

export const builtInPlayTypeDefinitions = Object.freeze([
  definition({
    id: "play_type_run",
    name: "Run",
    unit: "offense",
    builtInKey: "run",
    order: 0,
  }),
  definition({
    id: "play_type_pass",
    name: "Pass",
    unit: "offense",
    builtInKey: "pass",
    order: 1,
  }),
  definition({
    id: "play_type_rpo",
    name: "RPO",
    unit: "offense",
    builtInKey: "rpo",
    order: 2,
  }),
  definition({
    id: "play_type_screen",
    name: "Screen",
    unit: "offense",
    builtInKey: "screen",
    order: 3,
  }),
  definition({
    id: "play_type_coverage",
    name: "Coverage",
    unit: "defense",
    builtInKey: "coverage",
    order: 4,
  }),
  definition({
    id: "play_type_pressure",
    name: "Pressure",
    unit: "defense",
    builtInKey: "pressure",
    order: 5,
  }),
  // Return, Punt and Field Goal went with the special-teams unit (ADR 0053).
  // A Playbook that already holds them keeps them, archived, for the plays
  // that carry them; a new Playbook is not seeded with them.
]);

const builtInByLegacyName = new Map(
  builtInPlayTypeDefinitions.map((value) => [value.name, value]),
);

export function legacyPlayTypeReference(
  value: LegacyPlayType,
): PlayTypeReference | undefined {
  const definition = builtInByLegacyName.get(value);
  if (!definition) return undefined;
  return { id: definition.id, name: definition.name };
}

export function playTypeReference(
  definition: PlayTypeDefinition,
): PlayTypeReference {
  return { id: definition.id, name: definition.name };
}

/**
 * The words that change when a Play is flipped, and what each becomes. A
 * mirror moves the men; flipping the strength also moves the language, so a
 * card that said STRONG RIGHT does not end up describing the picture wrongly.
 * These are football terms rather than English ones, which is why they live
 * beside the label meanings and the zone classification.
 */
const FLIPPED_WORDS: Readonly<Record<string, string>> = Object.freeze({
  LEFT: "RIGHT",
  RIGHT: "LEFT",
  LT: "RT",
  RT: "LT",
  STRONG: "WEAK",
  WEAK: "STRONG",
  // A crosser is a crosser whichever way it runs; the word is listed so it is
  // plainly considered rather than accidentally left out.
  OVER: "OVER",
});

/** The letters that trade places when a Play is flipped. */
export const flippedPlayerLabels: Readonly<Record<string, string>> =
  Object.freeze({ X: "Z", Z: "X" });

/**
 * Flips the football words in a piece of the Coach's own writing, keeping the
 * case he wrote them in — ALL CAPS stays shouted, Title stays titled — and
 * leaving every word that is not one of them exactly as it is.
 */
export function flipStrengthWords(text: string): string {
  return text.replaceAll(/[A-Za-z]+/g, (word) => {
    const flipped = FLIPPED_WORDS[word.toUpperCase()];
    if (!flipped) return word;
    if (word === word.toUpperCase()) return flipped;
    return word[0] === word[0]!.toUpperCase()
      ? flipped[0]! + flipped.slice(1).toLowerCase()
      : flipped.toLowerCase();
  });
}
