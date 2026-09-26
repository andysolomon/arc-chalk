import { isLineman } from "./classifications";
import {
  assignRoles,
  ballLateralYards,
  LINE_OF_SCRIMMAGE_CLEARANCE_YARDS,
} from "./formations";
import { classifyZoneCoverage, holdInsideSidelines } from "./geometry";
import { linePresetByKey } from "./route-catalogue";
import type { Coordinate, MovementPath, PlayDocument, Player } from "./schema";

/**
 * Man coverage the way a video-game defense plays it (ADR 0060). A defender
 * given a man call is matched to the receiver it makes most sense for him to
 * take — corners the wide receivers, a nickel the slot, a safety the tight
 * end, a linebacker the back. Who is in man is the scheme's to say, so who
 * takes whom follows from it: with the safety deep in a two-man call, a
 * linebacker takes the tight end instead.
 *
 * Whether he also moves is the scheme's to say too (ADR 0061). With nobody
 * deep behind them — Cover 0 — the men in man line up on their men: a yard
 * inside him, at his own depth held between one yard and seven off the ball,
 * and they go where their men go. With deep help behind them — Cover 1,
 * Cover 2 Man — each stays where the call or the Coach put him, and only his
 * arrow says whom he has.
 *
 * The Coach can give a defender a man of his own choosing. That pick is
 * kept for as long as the man he picked is there to cover; everyone else is
 * matched again whenever the offense changes, so a new set on the other side
 * of the ball is met by a defense that has lined up against it.
 *
 * What it settles is stored on the Play like any other edit — the receiver
 * on the line, the defender where he stands — and it is settled in the same
 * step as the edit that called for it, so one undo takes both back.
 */

export type ReceiverKind = "wide" | "slot" | "tight" | "back";
export type DefenderKind =
  "corner" | "nickel" | "safety" | "backer" | "lineman";

export interface CoverableReceiver {
  readonly player: Player;
  readonly kind: ReceiverKind;
  /** Which side of the ball he stands on, from the defense's reading. */
  readonly side: "left" | "right";
}

/** A man call: a defender's zone line that ends in an arrow at a man. */
export function isManLine(path: MovementPath): boolean {
  return (
    path.kind === "zone" &&
    path.style.ending === "arrow" &&
    path.variant !== "alternate"
  );
}

/** A defender standing this deep or deeper is a deep man, whatever his letter. */
export const DEEP_STANCE_YARDS = 10;

/**
 * The man coverage the field shows, read the way a Coach calls it: by how
 * many defenders are deep behind the men in man. A deep drop is help, and
 * so is a man standing deep with no line at all — a free safety waiting to
 * be told. A rusher, a man in man and an underneath drop are not.
 */
export interface ManCoverageScheme {
  /** How many defenders are deep behind the men in man. */
  readonly deepHelp: number;
  /** "Cover 0", "Cover 1", "Cover 2 Man". */
  readonly name: string;
  /**
   * Whether the men in man line up on their men and go where they go. Only
   * with nobody deep behind them — Cover 0 — do they.
   */
  readonly linesUp: boolean;
}

export function manCoverageScheme(
  play: Pick<PlayDocument, "players" | "paths">,
): ManCoverageScheme | undefined {
  const inMan = new Set(
    play.paths.filter(isManLine).map(({ playerId }) => playerId),
  );
  if (inMan.size === 0) return undefined;
  const deepHelp = play.players.filter((player) => {
    if (player.unit !== "defense" || inMan.has(player.id)) return false;
    const lines = play.paths.filter(
      ({ playerId, variant }) =>
        playerId === player.id && variant !== "alternate",
    );
    if (lines.length === 0) {
      return player.position.depthYards >= DEEP_STANCE_YARDS;
    }
    return lines.some((path) => {
      const end = path.points.at(-1);
      if (path.kind !== "zone" || !end) return false;
      return (
        (path.coverageArea?.type ??
          classifyZoneCoverage(end, path.coverageArea?.radiusLateralYards)) ===
        "deep"
      );
    });
  }).length;
  return {
    deepHelp,
    name:
      deepHelp === 0
        ? "Cover 0"
        : deepHelp === 1
          ? "Cover 1"
          : `Cover ${deepHelp} Man`,
    linesUp: deepHelp === 0,
  };
}

const linesUp = (play: PlayDocument): boolean =>
  manCoverageScheme(play)?.linesUp ?? false;

/** A defender in man stands a yard inside his man, as most man calls ask. */
export const MAN_LEVERAGE_YARDS = 1;
/** And no further off the ball than this when he lines up on him. */
export const MAN_MAX_DEPTH_YARDS = 7;
/** The arrow stops short of the man it points at, so it does not hide him. */
const ARROW_SHORT_YARDS = 1.2;

/** A back stands at least this far behind the ball, and this near it. */
const BACKFIELD_DEPTH_YARDS = 2.5;
const BACKFIELD_LATERAL_YARDS = 6;
/** How far outside the last lineman a receiver can stand and be attached. */
const ATTACHED_YARDS = 3.5;

/** How much one step down a defender's list of preferences is worth, in yards. */
const PREFERENCE_YARDS = 30;
/** How much a defender prefers the man he already has, so a nudge re-sorts nobody. */
const STICKY_YARDS = 4;
/** What a receiver left uncovered costs, more than any pairing ever does. */
const UNCOVERED = 1000;
/** Past this many receivers the matching is shared out one man at a time. */
const MAX_EXACT_RECEIVERS = 12;

const SAME = 1e-9;

/**
 * How well each kind of defender suits each kind of receiver, best first:
 * a corner takes a wide receiver, a nickel the slot, a safety the tight end
 * and a linebacker the back — and each falls back on the man nearest his own
 * job when his first choice is covered.
 */
const PREFERENCE: Readonly<
  Record<DefenderKind, Readonly<Record<ReceiverKind, number>>>
> = {
  corner: { wide: 0, slot: 1, tight: 3, back: 4 },
  nickel: { wide: 1, slot: 0, tight: 2, back: 3 },
  safety: { wide: 2, slot: 1, tight: 0, back: 2 },
  backer: { wide: 4, slot: 3, tight: 1, back: 0 },
  lineman: { wide: 5, slot: 4, tight: 2, back: 0 },
};

const LETTERS: Readonly<Record<string, DefenderKind>> = {
  C: "corner",
  CB: "corner",
  LC: "corner",
  RC: "corner",
  LCB: "corner",
  RCB: "corner",
  BC: "corner",
  FC: "corner",
  NB: "nickel",
  NI: "nickel",
  NCB: "nickel",
  STAR: "nickel",
  D: "nickel",
  DB: "nickel",
  F: "safety",
  FS: "safety",
  SS: "safety",
  $: "safety",
  K: "safety",
  W: "backer",
  M: "backer",
  B: "backer",
  J: "backer",
  R: "backer",
  LB: "backer",
  WLB: "backer",
  MLB: "backer",
  SLB: "backer",
  ILB: "backer",
  OLB: "backer",
  MIKE: "backer",
  WILL: "backer",
  SAM: "backer",
  E: "lineman",
  T: "lineman",
  DE: "lineman",
  DT: "lineman",
  NT: "lineman",
  NG: "lineman",
  DL: "lineman",
};

/**
 * What a defender plays, read off his letter first — that is what a Coach
 * says he is — and off where he stands where the letter does not say: an N
 * on the ball is the nose and off it the nickel, an S deep is a safety and
 * in the box the Sam, and a letter nobody uses is read from his spot alone.
 */
export function defenderKind(
  player: Pick<Player, "label" | "position">,
  ball: number,
): DefenderKind {
  const letter = player.label.trim().toUpperCase();
  const wide = Math.abs(player.position.lateralYards - ball);
  const depth = player.position.depthYards;
  const onTheBall = depth <= BACKFIELD_DEPTH_YARDS && wide <= 8;
  if (letter === "N") return onTheBall ? "lineman" : "nickel";
  if (letter === "S") return depth >= DEEP_STANCE_YARDS ? "safety" : "backer";
  const named = LETTERS[letter];
  if (named) return named;
  if (onTheBall) return "lineman";
  if (depth >= DEEP_STANCE_YARDS) return "safety";
  if (wide >= 12) return "corner";
  if (wide >= 7) return "nickel";
  return "backer";
}

const LINE_ROLES: ReadonlySet<string> = new Set([
  "QB",
  "LT",
  "LG",
  "C",
  "RG",
  "RT",
]);

/**
 * The men a defense can cover: everyone on offense but the line and the
 * quarterback. A man deep in the backfield near the ball is a back. The
 * rest are counted from the sideline in on each side of the ball: the
 * widest is the wide receiver, a tight end — or a man attached to the end of
 * the line — is a tight end wherever he splits, and anyone else is a slot.
 */
export function coverableReceivers(
  play: Pick<PlayDocument, "players">,
): readonly CoverableReceiver[] {
  const offense = play.players.filter(({ unit }) => unit !== "defense");
  if (offense.length === 0) return [];
  const roles = assignRoles(offense);
  const ball = ballLateralYards(offense);
  const line = offense.filter(
    (player, index) => isLineman(player) || roles[index] === "C",
  );
  const lineEdge = (sign: 1 | -1) =>
    Math.max(
      0,
      ...line.map(({ position }) => sign * (position.lateralYards - ball)),
    );

  const eligible = offense.flatMap((player, index) =>
    isLineman(player) || LINE_ROLES.has(roles[index] ?? "")
      ? []
      : [{ player, role: roles[index] }],
  );
  const sideOf = (player: Player) =>
    player.position.lateralYards < ball
      ? ("left" as const)
      : ("right" as const);
  const inBackfield = (player: Player) =>
    player.position.depthYards <= -BACKFIELD_DEPTH_YARDS &&
    Math.abs(player.position.lateralYards - ball) <= BACKFIELD_LATERAL_YARDS;

  const receivers: CoverableReceiver[] = [];
  for (const side of ["left", "right"] as const) {
    const sign = side === "left" ? -1 : 1;
    const outsideIn = eligible
      .filter(({ player }) => !inBackfield(player) && sideOf(player) === side)
      .sort(
        (left, right) =>
          sign * (right.player.position.lateralYards - ball) -
            sign * (left.player.position.lateralYards - ball) ||
          compareIds(left.player.id, right.player.id),
      );
    outsideIn.forEach(({ player, role }, index) => {
      const attached =
        sign * (player.position.lateralYards - ball) <=
          lineEdge(sign) + ATTACHED_YARDS &&
        player.position.depthYards > -BACKFIELD_DEPTH_YARDS;
      receivers.push({
        player,
        side,
        kind:
          role === "TE" || attached ? "tight" : index === 0 ? "wide" : "slot",
      });
    });
  }
  for (const { player } of eligible) {
    if (inBackfield(player)) {
      receivers.push({ player, side: sideOf(player), kind: "back" });
    }
  }
  return receivers.sort(
    (left, right) =>
      left.player.position.lateralYards - right.player.position.lateralYards ||
      compareIds(left.player.id, right.player.id),
  );
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Who each defender takes. Every receiver is covered that can be — nobody is
 * left open while a defender in man has nobody — then each defender gets the
 * man who best suits him, the nearest across the field of those, and the man
 * he already had where it is a close call. Nobody is doubled: a defender left
 * over when every receiver is taken is free.
 */
function bestMatch(
  agents: readonly {
    readonly defender: Player;
    readonly kind: DefenderKind;
    readonly had?: string;
  }[],
  receivers: readonly CoverableReceiver[],
): (string | undefined)[] {
  const cost = (agent: (typeof agents)[number], receiver: CoverableReceiver) =>
    PREFERENCE[agent.kind][receiver.kind] * PREFERENCE_YARDS +
    Math.abs(
      agent.defender.position.lateralYards -
        receiver.player.position.lateralYards,
    ) -
    (agent.had === receiver.player.id ? STICKY_YARDS : 0);

  if (receivers.length > MAX_EXACT_RECEIVERS) {
    // A Coach who has lettered a dozen receivers gets a good match rather
    // than the best one: the cheapest pairing first, and so on down.
    const pairs = agents
      .flatMap((agent, a) =>
        receivers.map((receiver, r) => ({ a, r, cost: cost(agent, receiver) })),
      )
      .sort((left, right) => left.cost - right.cost);
    const taken = new Set<number>();
    const result: (string | undefined)[] = agents.map(() => undefined);
    for (const { a, r } of pairs) {
      if (result[a] !== undefined || taken.has(r)) continue;
      result[a] = receivers[r]!.player.id;
      taken.add(r);
    }
    return result;
  }

  // The exact answer, one defender at a time over which receivers are taken.
  const masks = 1 << receivers.length;
  let best = new Float64Array(masks).fill(Infinity);
  best[0] = 0;
  const picks: Int8Array[] = [];
  for (const agent of agents) {
    const next = new Float64Array(masks).fill(Infinity);
    const pick = new Int8Array(masks).fill(-2);
    for (let mask = 0; mask < masks; mask += 1) {
      const so = best[mask]!;
      if (so === Infinity) continue;
      if (so < next[mask]!) {
        next[mask] = so;
        pick[mask] = -1;
      }
      receivers.forEach((receiver, index) => {
        const bit = 1 << index;
        if (mask & bit) return;
        const total = so + cost(agent, receiver);
        if (total < next[mask | bit]!) {
          next[mask | bit] = total;
          pick[mask | bit] = index;
        }
      });
    }
    best = next;
    picks.push(pick);
  }
  let end = 0;
  let lowest = Infinity;
  for (let mask = 0; mask < masks; mask += 1) {
    const open = receivers.length - popCount(mask);
    const total = best[mask]! + open * UNCOVERED;
    if (total < lowest) {
      lowest = total;
      end = mask;
    }
  }
  const result: (string | undefined)[] = agents.map(() => undefined);
  for (let index = agents.length - 1; index >= 0; index -= 1) {
    const chosen = picks[index]![end]!;
    if (chosen >= 0) {
      result[index] = receivers[chosen]!.player.id;
      end &= ~(1 << chosen);
    }
  }
  return result;
}

function popCount(mask: number): number {
  let count = 0;
  for (let left = mask; left; left &= left - 1) count += 1;
  return count;
}

const samePlace = (left: Coordinate, right: Coordinate) =>
  Math.abs(left.lateralYards - right.lateralYards) <= SAME &&
  Math.abs(left.depthYards - right.depthYards) <= SAME;

/** +1 for a man on the right of the ball, −1 on the left. */
const sideSign = (lateralYards: number, ball: number): 1 | -1 =>
  lateralYards < ball ? -1 : 1;

/**
 * Where a defender lines up on a man he has just been given: a yard inside
 * him — over him, on a back — at his own depth held between a yard off the
 * ball and seven. A second defender on the same man takes the outside, a
 * third the inside again a little wider, so a double reads as one.
 */
function lineUpOn(
  play: PlayDocument,
  defender: Player,
  receiver: CoverableReceiver,
  ball: number,
  nth: number,
): Coordinate {
  const at = receiver.player.position;
  const sign = sideSign(at.lateralYards, ball);
  const leverage =
    receiver.kind === "back" && nth === 0
      ? 0
      : MAN_LEVERAGE_YARDS * (1 + Math.floor(nth / 2)) * (nth % 2 ? -1 : 1);
  return holdInsideSidelines(play.fieldProfile, {
    lateralYards: at.lateralYards - sign * leverage,
    depthYards: Math.max(
      LINE_OF_SCRIMMAGE_CLEARANCE_YARDS,
      Math.min(MAN_MAX_DEPTH_YARDS, defender.position.depthYards),
    ),
  });
}

/**
 * Where a defender goes when the man he has moves without him: the same
 * cushion, and the same leverage — measured toward the ball, so a man who
 * crosses the formation is still played from the inside if he was before.
 */
function stayWith(
  defender: Coordinate,
  from: Coordinate,
  to: Coordinate,
  ballBefore: number,
  ballAfter: number,
): Coordinate {
  const inside =
    (defender.lateralYards - from.lateralYards) *
    -sideSign(from.lateralYards, ballBefore);
  return {
    lateralYards:
      to.lateralYards - sideSign(to.lateralYards, ballAfter) * inside,
    depthYards: defender.depthYards,
  };
}

/** Two defenders closer than this read as one symbol. */
const APART_YARDS = 2.2;

/**
 * Defenders who have just lined up on their men step clear of anyone they
 * would stand on — two linebackers over stacked backs, a nickel over a
 * tight end beside a blitzer — sliding across the field, to the side of the
 * man in the way that his own man is on, until the two read apart. Men
 * already standing keep their spots; each one lined up makes room for those
 * before him. `lined` is who lined up, and where the man he covers stands.
 */
function makeRoom(
  play: PlayDocument,
  stances: Map<string, Coordinate>,
  lined: ReadonlyMap<string, Coordinate>,
): void {
  const defenders = play.players.filter(({ unit }) => unit === "defense");
  const standing = new Map(
    defenders
      .filter(({ id }) => !lined.has(id))
      .map(({ id, position }) => [id, stances.get(id) ?? position]),
  );
  for (const defender of defenders) {
    const man = lined.get(defender.id);
    if (!man) continue;
    let stance = stances.get(defender.id)!;
    for (let pass = 0; pass < 4; pass += 1) {
      let nearest: Coordinate | undefined;
      let gap = APART_YARDS;
      for (const other of standing.values()) {
        const apart = Math.hypot(
          stance.lateralYards - other.lateralYards,
          stance.depthYards - other.depthYards,
        );
        if (apart < gap) {
          gap = apart;
          nearest = other;
        }
      }
      if (!nearest) break;
      const away =
        Math.sign(man.lateralYards - nearest.lateralYards) ||
        Math.sign(defender.position.lateralYards - nearest.lateralYards) ||
        1;
      const down = stance.depthYards - nearest.depthYards;
      stance = holdInsideSidelines(play.fieldProfile, {
        lateralYards:
          nearest.lateralYards +
          away * Math.sqrt(Math.max(0, APART_YARDS ** 2 - down ** 2) + SAME),
        depthYards: stance.depthYards,
      });
    }
    stances.set(defender.id, stance);
    standing.set(defender.id, stance);
  }
}

/** The line from a defender's stance to the man he covers, stopping short of him. */
function aimedAt(
  path: MovementPath,
  stance: Coordinate,
  man: Coordinate,
): MovementPath {
  const across = man.lateralYards - stance.lateralYards;
  const down = man.depthYards - stance.depthYards;
  const length = Math.hypot(across, down);
  const short = Math.min(ARROW_SHORT_YARDS, length / 2);
  const end =
    length <= SAME
      ? { lateralYards: man.lateralYards, depthYards: man.depthYards + 0.5 }
      : {
          lateralYards: man.lateralYards - (across / length) * short,
          depthYards: man.depthYards - (down / length) * short,
        };
  const [first, last] = [path.points[0], path.points.at(-1)];
  if (
    path.points.length === 2 &&
    path.branches.length === 0 &&
    first &&
    last &&
    samePlace(first, stance) &&
    samePlace(last, end) &&
    first.control === undefined &&
    last.control === undefined
  ) {
    return path;
  }
  return {
    ...path,
    points: [
      { lateralYards: stance.lateralYards, depthYards: stance.depthYards },
      end,
    ],
    branches: [],
  };
}

/** A man call following nobody: the Man call's own shape off his stance. */
function followingNobody(path: MovementPath, stance: Coordinate): MovementPath {
  const rest = withoutCovers(path);
  const shape = linePresetByKey("man")!.pointsFrom(stance);
  return {
    ...rest,
    points: shape.map(({ lateralYards, depthYards }) => ({
      lateralYards,
      depthYards,
    })),
    branches: [],
  };
}

interface ManLine {
  readonly path: MovementPath;
  readonly defender: Player;
}

function manLinesOf(play: PlayDocument): readonly ManLine[] {
  const defenders = new Map(
    play.players
      .filter(({ unit }) => unit === "defense")
      .map((player) => [player.id, player]),
  );
  return play.paths.flatMap((path) => {
    const defender = defenders.get(path.playerId);
    return defender && isManLine(path) ? [{ path, defender }] : [];
  });
}

/**
 * What decides who covers whom: every man on offense as he stands and is
 * lettered, and every man call and who it is on. When none of that is
 * different between two versions of a Play there is nothing to match again.
 */
function matchingSignature(play: PlayDocument): string {
  const offense = play.players
    .filter(({ unit }) => unit !== "defense")
    .map(
      ({ id, label, role, symbol, position }) =>
        `${id}:${label}:${role ?? ""}:${symbol}:${position.lateralYards},${position.depthYards}`,
    )
    .sort();
  const calls = manLinesOf(play)
    .map(
      ({ path, defender }) =>
        `${path.id}:${defender.id}:${defender.label}:${path.covers?.playerId ?? ""}:${path.covers?.chosen ? 1 : 0}`,
    )
    .sort();
  return [...offense, "|", ...calls].join("\n");
}

/** Where the men in man stand, which is all their lines are drawn from. */
function stanceSignature(play: PlayDocument): string {
  return manLinesOf(play)
    .map(
      ({ path, defender }) =>
        `${path.id}:${defender.position.lateralYards},${defender.position.depthYards}`,
    )
    .sort()
    .join("\n");
}

/**
 * Settles man coverage from `before` to `after`. Nothing happens unless the
 * edit changed the offense, a man call, or where a man in man stands; a Play
 * stored with man lines is otherwise left exactly as it was drawn.
 *
 * When the offense or the man calls changed, every man call the Coach did
 * not pick is matched again. In Cover 0 a defender given a different man —
 * or every man in man, the moment the call becomes Cover 0 — lines up on
 * him, and a defender whose man moved without him goes with him, keeping his
 * cushion and leverage; one the Coach moved himself stays where he was put.
 * With deep help behind them nobody in man is moved at all (ADR 0061).
 * Every line that follows a man is drawn from its defender's stance to him.
 */
export function settleManCoverage(
  before: PlayDocument | undefined,
  after: PlayDocument,
): PlayDocument {
  const pressing = linesUp(after);
  const pressedBefore = before !== undefined && linesUp(before);
  const rematch =
    before === undefined ||
    pressing !== pressedBefore ||
    matchingSignature(before) !== matchingSignature(after);
  if (!rematch && stanceSignature(before) === stanceSignature(after)) {
    return after;
  }
  const lines = manLinesOf(after);
  if (lines.length === 0) return after;

  const receivers = coverableReceivers(after);
  const receiverById = new Map(receivers.map((r) => [r.player.id, r]));
  const offense = after.players.filter(({ unit }) => unit !== "defense");
  const ball = ballLateralYards(offense);

  // Who each man call follows now.
  const covering = new Map<string, MovementPath["covers"]>();
  if (rematch) {
    const taken = new Set<string>();
    const open: ManLine[] = [];
    for (const line of lines) {
      const covers = line.path.covers;
      if (covers?.chosen && receiverById.has(covers.playerId)) {
        covering.set(line.path.id, covers);
        taken.add(covers.playerId);
      } else {
        open.push(line);
      }
    }
    const pool = receivers.filter(({ player }) => !taken.has(player.id));
    const matched = bestMatch(
      open.map(({ path, defender }) => ({
        defender,
        kind: defenderKind(defender, ball),
        ...(path.covers ? { had: path.covers.playerId } : {}),
      })),
      pool,
    );
    open.forEach(({ path }, index) => {
      const playerId = matched[index];
      covering.set(path.id, playerId ? { playerId } : undefined);
    });
  } else {
    for (const { path } of lines) {
      const covers = path.covers;
      covering.set(
        path.id,
        covers && receiverById.has(covers.playerId) ? covers : undefined,
      );
    }
  }

  // Where each defender in man stands now: one line decides it. With deep
  // help behind him he stands where he is, so there is nothing to decide.
  const beforePlayers = new Map(
    (before?.players ?? []).map((player) => [player.id, player]),
  );
  const beforePaths = new Map(
    (before?.paths ?? []).map((path) => [path.id, path]),
  );
  const beforeBall =
    before === undefined
      ? ball
      : ballLateralYards(
          before.players.filter(({ unit }) => unit !== "defense"),
        );
  const stances = new Map<string, Coordinate>();
  const lined = new Map<string, Coordinate>();
  const onEach = new Map<string, number>();
  for (const { path, defender } of pressing ? lines : []) {
    if (stances.has(defender.id)) continue;
    const covers = covering.get(path.id);
    const receiver = covers ? receiverById.get(covers.playerId) : undefined;
    if (!receiver) continue;
    const had = beforePaths.get(path.id)?.covers?.playerId;
    const was = beforePlayers.get(defender.id);
    const manWas = beforePlayers.get(receiver.player.id);
    if (had !== receiver.player.id || !was || !manWas || !pressedBefore) {
      const nth = onEach.get(receiver.player.id) ?? 0;
      onEach.set(receiver.player.id, nth + 1);
      stances.set(defender.id, lineUpOn(after, defender, receiver, ball, nth));
      lined.set(defender.id, receiver.player.position);
      continue;
    }
    const manMoved = !samePlace(manWas.position, receiver.player.position);
    const heMoved = !samePlace(was.position, defender.position);
    stances.set(
      defender.id,
      manMoved && !heMoved
        ? holdInsideSidelines(
            after.fieldProfile,
            stayWith(
              defender.position,
              manWas.position,
              receiver.player.position,
              beforeBall,
              ball,
            ),
          )
        : defender.position,
    );
  }
  makeRoom(after, stances, lined);

  const shifts = new Map<string, Coordinate>();
  const players = after.players.map((player) => {
    const stance = stances.get(player.id);
    if (!stance || samePlace(stance, player.position)) return player;
    shifts.set(player.id, {
      lateralYards: stance.lateralYards - player.position.lateralYards,
      depthYards: stance.depthYards - player.position.depthYards,
    });
    return { ...player, position: stance };
  });
  const at = new Map(players.map((player) => [player.id, player.position]));

  let changed = shifts.size > 0;
  const paths = after.paths.map((path) => {
    const stance = at.get(path.playerId);
    if (!covering.has(path.id)) {
      // His other lines go where he goes, the way they do when he is dragged.
      const shift = shifts.get(path.playerId);
      if (!shift) return path;
      changed = true;
      return shiftedPath(path, shift);
    }
    const covers = covering.get(path.id);
    const man = covers ? at.get(covers.playerId) : undefined;
    let next: MovementPath;
    if (covers && man && stance) {
      const aimed = aimedAt(path, stance, man);
      next =
        sameCovers(path.covers, covers) && aimed === path
          ? path
          : { ...aimed, covers };
    } else if (path.covers && stance) {
      next = followingNobody(path, stance);
    } else {
      next = path;
    }
    if (next !== path) changed = true;
    return next;
  });
  return changed ? { ...after, players, paths } : after;
}

/** The line with whom it follows taken off it. */
function withoutCovers(path: MovementPath): MovementPath {
  const rest = { ...path };
  delete rest.covers;
  return rest;
}

function sameCovers(
  left: MovementPath["covers"],
  right: MovementPath["covers"],
): boolean {
  return (
    left?.playerId === right?.playerId &&
    Boolean(left?.chosen) === Boolean(right?.chosen)
  );
}

function shiftedPath(path: MovementPath, shift: Coordinate): MovementPath {
  const move = <P extends Coordinate>(point: P): P => ({
    ...point,
    lateralYards: point.lateralYards + shift.lateralYards,
    depthYards: point.depthYards + shift.depthYards,
  });
  const movePoint = (point: MovementPath["points"][number]) => ({
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
}

/**
 * Every defender in man lined up on his man afresh, as a man call puts him
 * the first time — which is where putting the defense back in a Cover 0 call
 * sends the men in man. In any other call they stay on the call's spots and
 * only their arrows are aimed.
 */
export function realignManCoverage(play: PlayDocument): PlayDocument {
  return settleManCoverage(undefined, play);
}

/**
 * Gives a defender's man call the receiver the Coach picked, or hands it
 * back to the defense's best match when he picks nobody. Settling does the
 * rest: the others re-sort, and in Cover 0 the defender lines up on his new
 * man.
 */
export function coverReceiver(
  play: PlayDocument,
  defenderId: string,
  receiverId: string | undefined,
): PlayDocument {
  if (
    receiverId !== undefined &&
    !coverableReceivers(play).some(({ player }) => player.id === receiverId)
  ) {
    return play;
  }
  let found = false;
  const paths = play.paths.map((path) => {
    if (found || path.playerId !== defenderId || !isManLine(path)) return path;
    found = true;
    if (receiverId === undefined) {
      const rest = withoutCovers(path);
      return path.covers?.chosen ? rest : path;
    }
    return { ...path, covers: { playerId: receiverId, chosen: true } };
  });
  return found ? { ...play, paths } : play;
}

/** A defender's man call, and whom it follows, for what the inspector says. */
export function manCoverageFor(
  play: PlayDocument,
  defenderId: string,
):
  | {
      readonly path: MovementPath;
      readonly receiver?: CoverableReceiver;
      readonly chosen: boolean;
    }
  | undefined {
  const line = manLinesOf(play).find(
    ({ defender }) => defender.id === defenderId,
  );
  if (!line) return undefined;
  const covers = line.path.covers;
  const receiver = covers
    ? coverableReceivers(play).find(
        ({ player }) => player.id === covers.playerId,
      )
    : undefined;
  return {
    path: line.path,
    ...(receiver ? { receiver } : {}),
    chosen: Boolean(covers?.chosen && receiver),
  };
}
