import { isLineman } from "./classifications";
import {
  LEGACY_FIELD_GEOMETRY,
  legacyCanvasToYards,
  legacyLateralSpanToYards,
} from "./geometry";
import type {
  Coordinate,
  Formation,
  FormationSlot,
  PathPoint,
  PlayDocument,
  Player,
} from "./schema";

/**
 * A Formation is a football object rather than a bag of coordinates: it is
 * described from the ball it is aligned to, and it names a role for every man
 * in it. The role is what lets a route survive a realignment — the Coach who
 * put a dig on his X wants it on his X afterwards, wherever the new set
 * stands him.
 */

/**
 * The letters a Coach writes on a man, and the position each one means. The
 * unlabelled men are worked out from where they stand instead, because a
 * formation carries positions and not roles — the same reading `isLineman`
 * already does for one man, done for the whole set at once.
 */
const ROLE_BY_LABEL: Readonly<Record<string, string>> = Object.freeze({
  Q: "QB",
  QB: "QB",
  F: "RB",
  B: "RB",
  T: "RB",
  R: "RB",
  H: "H",
  A: "H",
  Y: "TE",
  U: "TE",
  X: "X",
  Z: "Z",
  LT: "LT",
  LG: "LG",
  C: "C",
  RG: "RG",
  RT: "RT",
});

export function roleFromLabel(label: string): string | undefined {
  return ROLE_BY_LABEL[label.trim().toUpperCase()];
}

/** The five names of the offensive line, left to right as they stand. */
const LINE_ROLES = ["LT", "LG", "C", "RG", "RT"] as const;

/**
 * How far off the ball a man can stand and still be counted into the line,
 * and how far from the middle. These are the original's own 418-484 pixel
 * band and its 150-pixel reach, converted on the axis each belongs to.
 */
const LINE_BAND = Object.freeze({
  minDepthYards: legacyCanvasToYards({ x: 0, y: 484 }).depthYards,
  maxDepthYards: legacyCanvasToYards({ x: 0, y: 418 }).depthYards,
  lateralReachYards: legacyCanvasToYards({
    x: LEGACY_FIELD_GEOMETRY.midfieldX + 150,
    y: 0,
  }).lateralYards,
});

/** A back is deep and near the middle; anyone else unaccounted for is an H. */
const BACKFIELD_DEPTH_YARDS = -5;
const BACKFIELD_LATERAL_YARDS = legacyCanvasToYards({
  x: LEGACY_FIELD_GEOMETRY.midfieldX + 90,
  y: 0,
}).lateralYards;

/**
 * A role for every man, declared where he has one and inferred where he does
 * not: his letter first, since X, Y, Z, H, Q and F are unambiguous, then his
 * position — the five unlettered men nearest the ball are the line, and the
 * rest are backs or slots by how deep and how wide they stand.
 */
/**
 * Anyone standing somewhere on the field with a letter on him and perhaps a
 * position of his own — which both a Player and a Formation slot are.
 */
export interface Placed {
  readonly label: string;
  readonly position: Coordinate;
  readonly role?: string;
}

export function assignRoles(
  players: readonly Placed[],
): (string | undefined)[] {
  const roles = players.map(
    (player) => player.role ?? roleFromLabel(player.label),
  );
  const unknown = roles.flatMap((role, index) => (role ? [] : [index]));
  if (unknown.length === 0) return roles;

  const line = unknown
    .filter((index) => {
      const { position } = players[index]!;
      return (
        position.depthYards >= LINE_BAND.minDepthYards &&
        position.depthYards <= LINE_BAND.maxDepthYards &&
        Math.abs(position.lateralYards) <= LINE_BAND.lateralReachYards
      );
    })
    .sort(
      (left, right) =>
        Math.abs(players[left]!.position.lateralYards) -
        Math.abs(players[right]!.position.lateralYards),
    )
    .slice(0, LINE_ROLES.length)
    .sort(
      (left, right) =>
        players[left]!.position.lateralYards -
        players[right]!.position.lateralYards,
    );

  // A line short of five is centred on the names, so a four-man look reads
  // LG through RG rather than LT through RG.
  const offset = Math.floor((LINE_ROLES.length - line.length) / 2);
  for (const [order, index] of line.entries()) {
    roles[index] = LINE_ROLES[offset + order];
  }
  for (const index of unknown) {
    if (roles[index]) continue;
    const { position } = players[index]!;
    const deep = position.depthYards <= BACKFIELD_DEPTH_YARDS;
    roles[index] =
      deep && Math.abs(position.lateralYards) <= BACKFIELD_LATERAL_YARDS
        ? "RB"
        : "H";
  }
  return roles;
}

/** The men a Formation is about: the ones playing the side it aligns. */
export function offensivePlayers(play: PlayDocument): readonly Player[] {
  return play.players.filter((player) => player.unit !== "defense");
}

/**
 * Where the ball is spotted, read off the men rather than stored: the centre
 * if one is drawn, otherwise the middle of the line, otherwise the middle of
 * everyone. Splits are measured from it, so a set moved to a hash keeps its
 * shape.
 */
type Aligned = Pick<Player, "symbol" | "label" | "position" | "unit">;

export function ballLateralYards(players: readonly Aligned[]): number {
  if (players.length === 0) return 0;
  const centre = players.find(({ symbol }) => symbol === "square");
  if (centre) return centre.position.lateralYards;
  const mean = (list: readonly { readonly position: Coordinate }[]) =>
    list.reduce((total, { position }) => total + position.lateralYards, 0) /
    list.length;
  const line = players.filter(isLineman);
  return mean(line.length > 0 ? line : players);
}

export interface FormationMeta {
  readonly roles: readonly (string | undefined)[];
  readonly personnelLabel: string;
  readonly strength: "left" | "right" | "balanced";
}

/** The skill men whose side of the ball decides which way a set is strong. */
const STRENGTH_ROLES: ReadonlySet<string> = new Set(["X", "Z", "H", "TE"]);
const STRENGTH_MARGIN_YARDS = legacyCanvasToYards({
  x: LEGACY_FIELD_GEOMETRY.midfieldX + 20,
  y: 0,
}).lateralYards;

/**
 * What a set is, read off the men in it: personnel counted from the backs and
 * tight ends, and strength from which side the skill men are on. Both defer
 * to what the Formation declares, because a Coach who named his set means the
 * name he gave it.
 */
export function formationMeta(
  slots: readonly Placed[],
  declared: {
    readonly personnelLabel?: string;
    readonly strength?: FormationMeta["strength"];
  } = {},
): FormationMeta {
  const roles = assignRoles(slots);
  const count = (name: string) => roles.filter((role) => role === name).length;
  let right = 0;
  let left = 0;
  for (const [index, slot] of slots.entries()) {
    if (!STRENGTH_ROLES.has(roles[index] ?? "")) continue;
    if (slot.position.lateralYards > STRENGTH_MARGIN_YARDS) right += 1;
    else if (slot.position.lateralYards < -STRENGTH_MARGIN_YARDS) left += 1;
  }
  return {
    roles,
    personnelLabel: declared.personnelLabel ?? `${count("RB")}${count("TE")}`,
    strength:
      declared.strength ??
      (right > left ? "right" : left > right ? "left" : "balanced"),
  };
}

/**
 * How a realignment pairs up: which man takes which slot, which slots have
 * nobody to fill them, and who is left over. Worked out before anything
 * moves, because it is also what tells the Coach what is about to happen.
 */
export interface RealignmentPair {
  readonly playerId: string;
  readonly from: Coordinate;
  readonly slot: FormationSlot;
}

export interface RealignmentPlan {
  readonly pairs: readonly RealignmentPair[];
  /** Slots with nobody to fill them — new men, unless the Coach says not to. */
  readonly vacancies: readonly FormationSlot[];
  /** Men the set has no place for; they stay exactly where they are. */
  readonly orphans: readonly Player[];
  readonly movedCount: number;
  readonly carriedPathCount: number;
}

export function planRealignment(
  play: PlayDocument,
  formation: Formation,
): RealignmentPlan {
  const current = offensivePlayers(play);
  const currentRoles = assignRoles(current);
  const slotRoles = assignRoles(formation.slots);
  const taken = new Set<number>();
  const pairs: RealignmentPair[] = [];
  const vacancies: FormationSlot[] = [];

  for (const [slotIndex, slot] of formation.slots.entries()) {
    const match = current.findIndex(
      (_, index) =>
        !taken.has(index) && currentRoles[index] === slotRoles[slotIndex],
    );
    if (match < 0) {
      vacancies.push(slot);
      continue;
    }
    taken.add(match);
    pairs.push({
      playerId: current[match]!.id,
      from: current[match]!.position,
      slot,
    });
  }

  const kept = new Set(pairs.map(({ playerId }) => playerId));
  return {
    pairs,
    vacancies,
    orphans: current.filter((_, index) => !taken.has(index)),
    movedCount: pairs.filter(
      ({ from, slot }) =>
        from.lateralYards !== slot.position.lateralYards ||
        from.depthYards !== slot.position.depthYards,
    ).length,
    carriedPathCount: play.paths.filter(({ playerId }) => kept.has(playerId))
      .length,
  };
}

/**
 * How near a note has to be to a man to be counted as his, so that a depth
 * marker beside a receiver travels with him. The original's 54 canvas pixels,
 * measured as a straight distance in a frame where the axes do not agree —
 * so it is read here as a lateral span, which is the axis a note beside a man
 * is offset along.
 */
const LABEL_ADOPTION_YARDS = legacyCanvasToYards({
  x: LEGACY_FIELD_GEOMETRY.midfieldX + 54,
  y: 0,
}).lateralYards;

export interface RealignmentResult {
  readonly play: PlayDocument;
  readonly plan: RealignmentPlan;
  /** The men the set added, in the order their slots are listed. */
  readonly addedPlayerIds: readonly string[];
}

/**
 * Moves the men onto the set in place and carries what belongs to them: every
 * route travels with the man running it, control points included, and an
 * unbound offensive note goes with the nearest man who moved. A note pinned
 * to a route needs no help — it rides the route it is pinned to.
 */
export function applyFormation(
  play: PlayDocument,
  formation: Formation,
  createId: (prefix: string) => string,
  options: { readonly addMissingPlayers?: boolean } = {},
): RealignmentResult {
  const plan = planRealignment(play, formation);
  const halfWidth = play.fieldProfile.widthYards / 2;
  const inside = (point: Coordinate): Coordinate => ({
    lateralYards: Math.max(-halfWidth, Math.min(halfWidth, point.lateralYards)),
    depthYards: point.depthYards,
  });

  const shifts = new Map<
    string,
    { readonly from: Coordinate; readonly to: Coordinate }
  >();
  for (const pair of plan.pairs) {
    shifts.set(pair.playerId, { from: pair.from, to: pair.slot.position });
  }

  const players = play.players.map((player) => {
    const pair = plan.pairs.find(({ playerId }) => playerId === player.id);
    if (!pair) return player;
    return {
      ...player,
      position: pair.slot.position,
      // A man the Coach has lettered keeps the shape he was drawn with; only
      // an unlettered one takes the slot's, since that is the line's shape.
      ...(player.label.trim() === "" ? { symbol: pair.slot.symbol } : {}),
    };
  });

  const translate = (shift: { from: Coordinate; to: Coordinate }) => {
    const lateral = shift.to.lateralYards - shift.from.lateralYards;
    const depth = shift.to.depthYards - shift.from.depthYards;
    const move = (point: Coordinate): Coordinate =>
      inside({
        lateralYards: point.lateralYards + lateral,
        depthYards: point.depthYards + depth,
      });
    return { lateral, depth, move };
  };

  const paths = play.paths.map((path) => {
    const shift = shifts.get(path.playerId);
    if (!shift) return path;
    const { move } = translate(shift);
    const movePoint = (point: PathPoint): PathPoint => ({
      ...point,
      ...move(point),
      ...(point.control ? { control: move(point.control) } : {}),
    });
    return {
      ...path,
      points: path.points.map(movePoint),
      branches: path.branches.map((branch) => ({
        ...branch,
        points: branch.points.map(movePoint),
      })),
    };
  });

  const labels = play.labels.map((label) => {
    if (label.binding || label.unit === "defense") return label;
    let nearest:
      { shift: { from: Coordinate; to: Coordinate }; gap: number } | undefined;
    for (const shift of shifts.values()) {
      const gap = Math.hypot(
        label.position.lateralYards - shift.from.lateralYards,
        label.position.depthYards - shift.from.depthYards,
      );
      if (gap <= LABEL_ADOPTION_YARDS && (!nearest || gap < nearest.gap)) {
        nearest = { shift, gap };
      }
    }
    if (!nearest) return label;
    const { lateral, depth, move } = translate(nearest.shift);
    if (lateral === 0 && depth === 0) return label;
    return {
      ...label,
      position: move(label.position),
      ...(label.leader
        ? { leader: { ...label.leader, endpoint: move(label.leader.endpoint) } }
        : {}),
    };
  });

  const addedPlayerIds: string[] = [];
  const added: Player[] = [];
  if (options.addMissingPlayers !== false) {
    for (const slot of plan.vacancies) {
      const id = createId("player");
      addedPlayerIds.push(id);
      added.push({
        id,
        unit: slot.unit,
        position: slot.position,
        symbol: slot.symbol,
        label: slot.label,
        sublabel: slot.sublabel,
        fill: slot.fill,
        color: slot.color,
      });
    }
  }

  const bound = [
    ...plan.pairs.map(({ playerId, slot }) => ({ slotId: slot.id, playerId })),
    ...added.map((player, index) => ({
      slotId: plan.vacancies[index]!.id,
      playerId: player.id,
    })),
  ];

  return {
    plan,
    addedPlayerIds,
    play: {
      ...play,
      players: [...players, ...added],
      paths,
      labels,
      formationSource: {
        formationId: formation.id,
        revision: formation.revision,
        slotBindings: bound,
      },
    },
  };
}

/**
 * How close a man has to stand to a slot to count as filling it. The
 * original's 14 pixels, converted on the axis each belongs to — which makes
 * the depth tolerance the tighter of the two, as it should be, since depth is
 * drawn at two thirds the lateral scale.
 */
const RECOGNITION_TOLERANCE = Object.freeze({
  lateralYards: legacyCanvasToYards({
    x: LEGACY_FIELD_GEOMETRY.midfieldX + 14,
    y: 0,
  }).lateralYards,
  depthYards: legacyCanvasToYards({
    x: 0,
    y: LEGACY_FIELD_GEOMETRY.lineOfScrimmageY - 14,
  }).depthYards,
});

export interface FormationMatch {
  readonly formation?: Formation;
  readonly confidence: number;
}

/**
 * Which known set is on the field right now, matched role by role and
 * measured from the ball rather than from the middle, so a set moved to a
 * hash is still recognised as itself.
 */
export function recognizeFormation(
  play: PlayDocument,
  catalogue: readonly Formation[],
): FormationMatch {
  const current = offensivePlayers(play);
  if (current.length < LINE_ROLES.length) return { confidence: 0 };
  const currentRoles = assignRoles(current);
  const currentBall = ballLateralYards(current);

  let best: FormationMatch = { confidence: 0 };
  for (const formation of catalogue) {
    if (formation.slots.length !== current.length) continue;
    const offset = currentBall - ballLateralYards(formation.slots);
    const slotRoles = assignRoles(formation.slots);
    const taken = new Set<number>();
    let hits = 0;
    for (const [slotIndex, slot] of formation.slots.entries()) {
      const match = current.findIndex(
        (_, index) =>
          !taken.has(index) && currentRoles[index] === slotRoles[slotIndex],
      );
      if (match < 0) continue;
      taken.add(match);
      const man = current[match]!.position;
      if (
        Math.abs(man.lateralYards - (slot.position.lateralYards + offset)) <=
          RECOGNITION_TOLERANCE.lateralYards &&
        Math.abs(man.depthYards - slot.position.depthYards) <=
          RECOGNITION_TOLERANCE.depthYards
      ) {
        hits += 1;
      }
    }
    const confidence = hits / formation.slots.length;
    if (confidence > best.confidence) best = { formation, confidence };
  }
  return best;
}

/** How sure the reading has to be before a set is named without being applied. */
export const RECOGNITION_THRESHOLD = 0.85;

/**
 * Below this there is no split to be proportional about, so a side is taken
 * as unchanged rather than scaled by the ratio of two rounding errors.
 */
const MIN_REACH_YARDS = legacyCanvasToYards({
  x: LEGACY_FIELD_GEOMETRY.midfieldX + 4,
  y: 0,
}).lateralYards;

/**
 * Recognising a set and confirming the one the Coach applied are different
 * questions, and the original allows them different room: three pixels across
 * and two deep here, against fourteen for the reading, because a set he named
 * stops being that set the moment a man is somewhere else.
 */
const APPLIED_TOLERANCE = Object.freeze({
  lateralYards: legacyCanvasToYards({
    x: LEGACY_FIELD_GEOMETRY.midfieldX + 3,
    y: 0,
  }).lateralYards,
  depthYards: legacyCanvasToYards({
    x: 0,
    y: LEGACY_FIELD_GEOMETRY.lineOfScrimmageY - 2,
  }).depthYards,
});

/**
 * Whether the set the Coach applied is still what is on the field. It is a
 * side-by-side proportional match rather than an exact one, so tightening the
 * splits keeps the name — he is still in Trips Right when he brings his Z in.
 */
export function formationStillApplied(
  play: PlayDocument,
  formation: Formation,
): boolean {
  const current = offensivePlayers(play);
  if (current.length !== formation.slots.length) return false;
  const currentBall = ballLateralYards(current);
  const slotBall = ballLateralYards(formation.slots);

  const reach = (
    list: readonly { readonly position: Coordinate }[],
    ball: number,
    sign: 1 | -1,
  ) =>
    Math.max(
      0,
      ...list.map(({ position }) => sign * (position.lateralYards - ball)),
    );
  const ratio = (now: number, was: number) =>
    was > MIN_REACH_YARDS && now > MIN_REACH_YARDS ? now / was : 1;
  const scaleLeft = ratio(
    reach(current, currentBall, -1),
    reach(formation.slots, slotBall, -1),
  );
  const scaleRight = ratio(
    reach(current, currentBall, 1),
    reach(formation.slots, slotBall, 1),
  );
  const within = (scale: number) => scale >= 0.42 && scale <= 1.2;
  if (!within(scaleLeft) || !within(scaleRight)) return false;

  const remaining = [...current];
  return formation.slots.every((slot) => {
    const offset = slot.position.lateralYards - slotBall;
    const expected =
      currentBall + offset * (offset < 0 ? scaleLeft : scaleRight);
    const index = remaining.findIndex(
      ({ position }) =>
        Math.abs(position.lateralYards - expected) <=
          APPLIED_TOLERANCE.lateralYards &&
        Math.abs(position.depthYards - slot.position.depthYards) <=
          APPLIED_TOLERANCE.depthYards,
    );
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
}

/** The set the Coach is in: the one he named while it holds, else the one read off the field. */
export function currentFormation(
  play: PlayDocument,
  catalogue: readonly Formation[],
): Formation | undefined {
  if (offensivePlayers(play).length === 0) return undefined;
  const named = play.formationSource
    ? catalogue.find(({ id }) => id === play.formationSource!.formationId)
    : undefined;
  if (named && formationStillApplied(play, named)) return named;
  const read = recognizeFormation(play, catalogue);
  return read.confidence >= RECOGNITION_THRESHOLD ? read.formation : undefined;
}

/**
 * The margin either side of the ball inside which a set counts as spotted in
 * the middle. The original measured it in the forty canvas pixels it drew in.
 */
const HASH_MARGIN_YARDS = legacyLateralSpanToYards(40);

/**
 * The offense on the field, read back as a set of its own. A Coach who has
 * moved his men into something he wants again should not have to describe it
 * twice, so everything the set needs — its personnel, its strength, the roles
 * that let a route survive being realigned into it, the ball it is aligned to
 * and the hash that ball sits on — is read off the men rather than asked for.
 * Only the name is his to give.
 *
 * Defenders are left out: this is the offense he set, and a defensive call is
 * a separate thing the Coach picks from its own book.
 */
export function formationFromOffense(
  play: PlayDocument,
  named: {
    readonly id: string;
    readonly playbookId: string;
    readonly name: string;
    readonly slotId: (index: number) => string;
  },
): Formation | undefined {
  const offense = offensivePlayers(play);
  if (offense.length === 0) return undefined;

  const meta = formationMeta(offense);
  const lateralYards = ballLateralYards(offense);

  return {
    schemaVersion: 1,
    id: named.id,
    playbookId: named.playbookId,
    revision: 1,
    name: named.name,
    unit: "offense",
    description: `${offense.length} pl`,
    family: "custom",
    personnelLabel: meta.personnelLabel,
    strength: meta.strength,
    ball: {
      position: { lateralYards, depthYards: 0 },
      hash:
        lateralYards < -HASH_MARGIN_YARDS
          ? "left"
          : lateralYards > HASH_MARGIN_YARDS
            ? "right"
            : "middle",
    },
    slots: offense.map((player, index) => ({
      id: named.slotId(index),
      unit: "offense" as const,
      // `assignRoles` places every man, and falls back to H itself for one
      // it cannot read; a slot's role is never empty.
      role: meta.roles[index] ?? "H",
      position: player.position,
      symbol: player.symbol,
      label: player.label,
      sublabel: player.sublabel,
      fill: player.fill,
      color: player.color,
    })),
    rolePairs: [],
  };
}
