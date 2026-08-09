import { legacyCanvasToYards } from "./geometry";
import type { Formation, FormationSlot, PlayerSymbol } from "./schema";

/**
 * The sets the original ships with, written in the canvas pixels it drew them
 * in so every number here can be read straight off the frozen specification,
 * and converted once on the axis each belongs to. Nine sets are described
 * strong to the right; each one's left-handed twin is derived from it rather
 * than written out again, because a Coach who tightens one expects the other
 * to be the same set the other way.
 */

interface LegacySlot {
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly role: string;
  readonly symbol?: PlayerSymbol;
}

interface LegacyFormation {
  readonly key: string;
  readonly name: string;
  readonly family: string;
  readonly personnel: string;
  readonly description: string;
  readonly slots: readonly LegacySlot[];
}

const line: readonly LegacySlot[] = [
  { x: 428, y: 448, label: "", role: "LT" },
  { x: 464, y: 448, label: "", role: "LG" },
  { x: 500, y: 448, label: "", role: "C", symbol: "square" },
  { x: 536, y: 448, label: "", role: "RG" },
  { x: 572, y: 448, label: "", role: "RT" },
];

const shotgunQb: LegacySlot = { x: 500, y: 504, label: "Q", role: "QB" };

const man = (
  x: number,
  y: number,
  label: string,
  role: string,
): LegacySlot => ({
  x,
  y,
  label,
  role,
});

const rightHandedSets: readonly LegacyFormation[] = [
  {
    key: "gun-doubles",
    name: "Gun Doubles",
    family: "doubles",
    personnel: "11",
    description: "2×2",
    slots: [
      shotgunQb,
      man(556, 504, "F", "RB"),
      man(130, 452, "X", "X"),
      man(262, 452, "H", "H"),
      man(738, 452, "Y", "TE"),
      man(870, 452, "Z", "Z"),
    ],
  },
  {
    key: "gun-trips",
    name: "Gun Trips",
    family: "trips",
    personnel: "11",
    description: "3×1",
    slots: [
      shotgunQb,
      man(444, 504, "F", "RB"),
      man(130, 452, "X", "X"),
      man(654, 452, "Y", "TE"),
      man(756, 452, "H", "H"),
      man(872, 452, "Z", "Z"),
    ],
  },
  {
    key: "gun-bunch",
    name: "Gun Bunch",
    family: "bunch",
    personnel: "11",
    description: "bunch",
    slots: [
      shotgunQb,
      man(444, 504, "F", "RB"),
      man(130, 452, "X", "X"),
      man(700, 446, "Y", "TE"),
      man(736, 468, "H", "H"),
      man(772, 446, "Z", "Z"),
    ],
  },
  {
    key: "empty",
    name: "Empty",
    family: "empty",
    personnel: "11",
    description: "3×2",
    slots: [
      shotgunQb,
      man(110, 452, "X", "X"),
      man(228, 452, "F", "RB"),
      man(660, 452, "Y", "TE"),
      man(762, 452, "H", "H"),
      man(878, 452, "Z", "Z"),
    ],
  },
  {
    key: "iform",
    name: "I-Form",
    family: "iform",
    personnel: "21",
    description: "21 pers",
    slots: [
      man(500, 478, "Q", "QB"),
      man(500, 526, "F", "RB"),
      man(500, 566, "H", "H"),
      man(130, 452, "X", "X"),
      man(870, 452, "Z", "Z"),
      man(618, 450, "Y", "TE"),
    ],
  },
  {
    key: "gun-spread",
    name: "Gun Spread",
    family: "spread",
    personnel: "10",
    description: "2×2 · 4 WR",
    slots: [
      shotgunQb,
      man(556, 504, "F", "RB"),
      man(120, 452, "X", "X"),
      man(258, 452, "H", "H"),
      man(742, 452, "A", "H"),
      man(880, 452, "Z", "Z"),
    ],
  },
  {
    key: "gun-ace",
    name: "Gun Ace",
    family: "ace",
    personnel: "12",
    description: "2 TE",
    slots: [
      shotgunQb,
      man(556, 504, "F", "RB"),
      man(130, 452, "X", "X"),
      man(392, 450, "U", "TE"),
      man(608, 450, "Y", "TE"),
      man(870, 452, "Z", "Z"),
    ],
  },
  {
    key: "strong",
    name: "Strong",
    family: "strong",
    personnel: "21",
    description: "21 · offset",
    slots: [
      man(500, 478, "Q", "QB"),
      man(500, 540, "F", "RB"),
      man(576, 506, "H", "H"),
      man(130, 452, "X", "X"),
      man(870, 452, "Z", "Z"),
      man(618, 450, "Y", "TE"),
    ],
  },
  {
    key: "pistol-trips",
    name: "Pistol Trips",
    family: "trips",
    personnel: "11",
    description: "3×1 · pistol",
    slots: [
      man(500, 492, "Q", "QB"),
      man(500, 548, "F", "RB"),
      man(130, 452, "X", "X"),
      man(654, 452, "Y", "TE"),
      man(756, 452, "H", "H"),
      man(872, 452, "Z", "Z"),
    ],
  },
];

/**
 * Reflecting a set is geometry for everyone but the men whose name says which
 * side they play: the X and the Z trade places, and so do the tackles and the
 * guards, because a left tackle reflected is a right tackle.
 */
const SWAPPED: Readonly<Record<string, string>> = Object.freeze({
  X: "Z",
  Z: "X",
  LT: "RT",
  RT: "LT",
  LG: "RG",
  RG: "LG",
});

const formationId = (key: string, hand: "right" | "left") =>
  `formation_${key.replaceAll("-", "_")}_${hand}`;

function toSlot(
  id: string,
  slot: LegacySlot,
  reflected: boolean,
): FormationSlot {
  const position = legacyCanvasToYards({
    x: reflected ? 1000 - slot.x : slot.x,
    y: slot.y,
  });
  return {
    id,
    unit: "offense",
    role: reflected ? (SWAPPED[slot.role] ?? slot.role) : slot.role,
    position,
    symbol: slot.symbol ?? "circle",
    label: reflected ? (SWAPPED[slot.label] ?? slot.label) : slot.label,
    sublabel: "",
    fill: "none",
    color: "ink",
  };
}

function build(set: LegacyFormation, hand: "right" | "left"): Formation {
  const id = formationId(set.key, hand);
  const reflected = hand === "left";
  const slots = [...line, ...set.slots].map((slot, index) =>
    toSlot(`${id}_s${index}`, slot, reflected),
  );
  return {
    schemaVersion: 1,
    id,
    playbookId: STOCK_PLAYBOOK_ID,
    revision: 1,
    name: `${set.name} ${hand === "right" ? "Right" : "Left"}`,
    unit: "offense",
    description: set.description,
    family: set.family,
    personnelLabel: set.personnel,
    strength: hand,
    mirrorFormationId: formationId(set.key, reflected ? "right" : "left"),
    ball: { position: { lateralYards: 0, depthYards: 0 }, hash: "middle" },
    slots,
    rolePairs: [],
  };
}

/** The Playbook the shipped sets belong to, so a saved set can sit beside them. */
export const STOCK_PLAYBOOK_ID = "playbook_stock";

/**
 * The eighteen sets, each right-handed one followed by its left-handed twin,
 * which is the order the original lists them and the order a call sheet
 * groups them in.
 */
export const stockFormations: readonly Formation[] = Object.freeze(
  rightHandedSets.flatMap((set) => [build(set, "right"), build(set, "left")]),
);

/**
 * What each family of sets is called when the browser groups them, and the
 * order a call sheet puts them in. The short name is what fits on a filter
 * chip; the long one is what the heading over a group of cards says.
 */
export const formationFamilies: readonly {
  readonly key: string;
  readonly shortName: string;
  readonly name: string;
}[] = Object.freeze([
  { key: "doubles", shortName: "Doubles", name: "Doubles · 2×2" },
  { key: "trips", shortName: "Trips", name: "Trips · 3×1" },
  { key: "bunch", shortName: "Bunch", name: "Bunch" },
  { key: "spread", shortName: "Spread", name: "Spread · 4 wide" },
  { key: "empty", shortName: "Empty", name: "Empty · 3×2" },
  { key: "ace", shortName: "2 TE", name: "Two tight ends" },
  { key: "iform", shortName: "I-form", name: "Under center" },
  { key: "strong", shortName: "Strong", name: "Under center · offset" },
  { key: "custom", shortName: "Mine", name: "Saved by me" },
]);
