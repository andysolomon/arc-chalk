import {
  applyPlayCommand,
  canonicalStringify,
  coverableReceivers,
  defensiveFieldOf,
  defensiveLineKinds,
  defensivePositions,
  deletePathsCommand,
  diffPlayDocuments,
  gapLateralYards,
  holdInsideSidelines,
  linePresetByKey,
  readKeyName,
  settleDefensiveCoaching,
  type Assignment,
  type Coordinate,
  type DefensiveReadKey,
  type MovementPath,
  type PlayCommand,
  type PlayDocument,
  type Player,
  type ReadPerspective,
} from "@chalk/domain";

export type DefensiveAdjustment =
  | { kind: "front-shift"; direction: -1 | 1 }
  | { kind: "front-spacing"; spread: boolean }
  | { kind: "front-slant"; direction: "left" | "right" | "in" | "out" }
  | { kind: "point-of-attack"; side: -1 | 1; gap: 0 | 1 | 2 | 3 }
  | { kind: "linebacker-blitz" }
  | { kind: "linebacker-zone"; zone: "hook" | "curlflat" | "spy" }
  | { kind: "show-blitz"; on: boolean }
  | { kind: "contain" }
  | {
      kind: "coverage";
      technique:
        | "press"
        | "back-off"
        | "underneath"
        | "overtop"
        | "inside"
        | "outside"
        | "aggressive"
        | "balanced"
        | "reset";
    }
  | {
      kind: "secondary-align";
      position: "corners" | "safeties";
      axis: "depth" | "width";
      yards: number;
    }
  | {
      kind: "read";
      playerId: string;
      perspective: ReadPerspective;
      read?: DefensiveReadKey;
      targetId?: string;
    }
  | { kind: "plaster"; playerId: string; targetId?: string };

/** Targeting is shared by the controls and commands; a partial selection never expands. */
export function defensiveAdjustmentTargets(
  document: PlayDocument,
  selectedIds?: readonly string[],
) {
  const defense = document.players.filter(
    (player) => player.unit === "defense",
  );
  const positions = defensivePositions(document);
  const eligible = defense
    .map((player, index) => ({ player, position: positions[index]! }))
    .filter(
      ({ player }) =>
        selectedIds === undefined || selectedIds.includes(player.id),
    );
  return {
    all: eligible.map(({ player }) => player),
    front: eligible
      .filter(({ position }) => position.group === "front")
      .map(({ player }) => player),
    linebackers: eligible
      .filter(({ position }) => position.group === "linebackers")
      .map(({ player }) => player),
    coverage: eligible
      .filter(({ position }) => position.group !== "front")
      .map(({ player }) => player),
    corners: eligible
      .filter(({ position }) => position.name === "Corner")
      .map(({ player }) => player),
    safeties: eligible
      .filter(({ position }) => /safety/i.test(position.name))
      .map(({ player }) => player),
  };
}

function moveStances(
  document: PlayDocument,
  positions: ReadonlyMap<string, Coordinate>,
): PlayDocument {
  return {
    ...document,
    players: document.players.map((player) =>
      positions.has(player.id)
        ? { ...player, position: positions.get(player.id)! }
        : player,
    ),
    // Changing a look changes the stance, not the zone or gap he must reach.
    paths: document.paths.map((path) =>
      positions.has(path.playerId)
        ? {
            ...path,
            points: [positions.get(path.playerId)!, ...path.points.slice(1)],
          }
        : path,
    ),
  };
}

function replaceJobs(
  document: PlayDocument,
  men: readonly Player[],
  job: (man: Player) => string,
  createId: (prefix: string) => string,
): PlayDocument {
  const ids = new Set(men.map((man) => man.id));
  const removed = document.paths.filter(
    (path) =>
      ids.has(path.playerId) &&
      defensiveLineKinds.has(path.kind) &&
      path.variant !== "alternate",
  );
  const cleared = removed.length
    ? applyPlayCommand(
        document,
        deletePathsCommand(
          document,
          removed.map((path) => path.id),
        ),
      )
    : document;
  const field = defensiveFieldOf(document);
  const paths: MovementPath[] = men.map((man) => {
    const preset = linePresetByKey(job(man))!;
    return {
      id: createId("path"),
      playerId: man.id,
      kind: preset.kind,
      points: [...preset.pointsFrom(man.position, field)],
      branches: [],
      preset: preset.key,
      style: {
        ...preset.style,
        color:
          preset.kind === "blitz" || preset.kind === "stunt" ? "red" : "blue",
      },
      ...(preset.area
        ? {
            coverageArea: {
              type: preset.area.type,
              radiusLateralYards: preset.area.radiusLateralYards,
              radiusDepthYards: preset.area.radiusDepthYards,
            },
          }
        : {}),
    };
  });
  return { ...cleared, paths: [...cleared.paths, ...paths] };
}

function removeCoaching(
  document: PlayDocument,
  playerId: string,
  predicate: (assignment: Assignment) => boolean,
): PlayDocument {
  const removed = document.assignments.filter(
    (assignment) => assignment.playerId === playerId && predicate(assignment),
  );
  const pathIds = new Set(
    removed.flatMap((assignment) =>
      assignment.actions.flatMap((action) =>
        action.kind === "movement" ? [action.pathId] : [],
      ),
    ),
  );
  const cleared = pathIds.size
    ? applyPlayCommand(document, deletePathsCommand(document, [...pathIds]))
    : document;
  return {
    ...cleared,
    assignments: cleared.assignments.filter(
      (assignment) => !removed.some((old) => old.id === assignment.id),
    ),
  };
}

/** All defensive adjustments are a single saved edit and a single undo step. */
export function defensiveAdjustmentCommand(
  document: PlayDocument,
  selectedIds: readonly string[] | undefined,
  adjustment: DefensiveAdjustment,
  createId: (prefix: string) => string,
): PlayCommand | undefined {
  const targets = defensiveAdjustmentTargets(document, selectedIds);
  const field = defensiveFieldOf(document);
  const ball = field.ballLateralYards;
  const side = (man: Player): -1 | 1 =>
    man.position.lateralYards < ball ? -1 : 1;
  const move = (
    men: readonly Player[],
    position: (man: Player) => Coordinate,
  ) =>
    moveStances(
      document,
      new Map(
        men.map((man) => [
          man.id,
          holdInsideSidelines(document.fieldProfile, position(man)),
        ]),
      ),
    );
  let next = document;
  let label = "Defensive adjustment";
  switch (adjustment.kind) {
    case "front-shift":
      label = `Shift D-line ${adjustment.direction < 0 ? "left" : "right"}`;
      next = move(targets.front, (man) => ({
        ...man.position,
        lateralYards: man.position.lateralYards + adjustment.direction * 1.5,
      }));
      break;
    case "front-spacing":
      label = adjustment.spread ? "Spread D-line" : "Pinch D-line";
      next = move(targets.front, (man) => ({
        ...man.position,
        lateralYards:
          ball +
          side(man) *
            Math.max(
              0.5,
              Math.abs(man.position.lateralYards - ball) +
                (adjustment.spread ? 1.5 : -1.5),
            ),
      }));
      break;
    case "front-slant":
      label = `Slant ${adjustment.direction}`;
      next = replaceJobs(
        document,
        targets.front,
        (man) =>
          adjustment.direction === "in"
            ? "slantin"
            : adjustment.direction === "out"
              ? "slantout"
              : side(man) === (adjustment.direction === "left" ? -1 : 1)
                ? "slantout"
                : "slantin",
        createId,
      );
      break;
    case "point-of-attack": {
      label = `Attack ${adjustment.side < 0 ? "left" : "right"} ${["A", "B", "C", "D"][adjustment.gap]} gap`;
      next = replaceJobs(document, targets.front, () => "rush", createId);
      const ids = new Set(targets.front.map((man) => man.id));
      next = {
        ...next,
        paths: next.paths.map((path) =>
          ids.has(path.playerId) &&
          path.variant !== "alternate" &&
          path.preset === "rush"
            ? {
                ...path,
                preset: undefined,
                points: [
                  path.points[0]!,
                  {
                    lateralYards: gapLateralYards(
                      field,
                      adjustment.side,
                      adjustment.gap,
                    ),
                    depthYards: -2,
                  },
                ],
                coachingNote: label,
              }
            : path,
        ),
      };
      break;
    }
    case "linebacker-blitz":
      label = "Blitz linebackers";
      next = replaceJobs(
        document,
        targets.linebackers,
        () => "blitz",
        createId,
      );
      break;
    case "linebacker-zone":
      label = `Linebackers — ${linePresetByKey(adjustment.zone)!.name}`;
      next = replaceJobs(
        document,
        targets.linebackers,
        () => adjustment.zone,
        createId,
      );
      break;
    case "show-blitz": {
      label = adjustment.on ? "Show blitz" : "Hide blitz look";
      next = move(targets.linebackers, (man) => ({
        ...man.position,
        depthYards: adjustment.on
          ? 1.5
          : (man.defensiveTechnique?.showBlitzFromDepth ??
            man.position.depthYards),
      }));
      const ids = new Set(targets.linebackers.map((man) => man.id));
      next = {
        ...next,
        players: next.players.map((man) => {
          if (!ids.has(man.id)) return man;
          const was = document.players.find((before) => before.id === man.id)!;
          const technique = { ...man.defensiveTechnique };
          if (adjustment.on)
            technique.showBlitzFromDepth =
              was.defensiveTechnique?.showBlitzFromDepth ??
              was.position.depthYards;
          else delete technique.showBlitzFromDepth;
          return { ...man, defensiveTechnique: technique };
        }),
      };
      break;
    }
    case "contain": {
      label = "Contain";
      const edge = [-1, 1].flatMap((sign) =>
        [...targets.front]
          .filter((man) => side(man) === sign)
          .sort(
            (a, b) =>
              sign * (b.position.lateralYards - a.position.lateralYards),
          )
          .slice(0, 1),
      );
      next = replaceJobs(document, edge, () => "contain", createId);
      break;
    }
    case "coverage": {
      const technique = adjustment.technique;
      label = {
        press: "Press",
        "back-off": "Back off",
        underneath: "Shade underneath",
        overtop: "Shade overtop",
        inside: "Commit inside",
        outside: "Commit outside",
        aggressive: "Aggressive coverage",
        balanced: "Balanced coverage",
        reset: "Reset coverage techniques",
      }[technique];
      if (technique === "press" || technique === "back-off") {
        next = move([...targets.corners, ...targets.safeties], (man) => ({
          ...man.position,
          depthYards:
            technique === "press"
              ? targets.safeties.includes(man)
                ? 8
                : 1
              : targets.safeties.includes(man)
                ? 16
                : 7,
        }));
        break;
      }
      const ids = new Set(targets.coverage.map((man) => man.id));
      next = {
        ...document,
        players: document.players.map((man) => {
          if (!ids.has(man.id)) return man;
          const value = { ...man.defensiveTechnique };
          if (technique === "underneath" || technique === "overtop")
            value.depthShade = technique;
          else if (technique === "inside" || technique === "outside")
            value.leverage = technique;
          else if (technique === "aggressive" || technique === "balanced")
            value.aggressive = technique === "aggressive";
          else {
            delete value.depthShade;
            delete value.leverage;
            delete value.aggressive;
          }
          return { ...man, defensiveTechnique: value };
        }),
      };
      break;
    }
    case "secondary-align": {
      if (!Number.isFinite(adjustment.yards)) return undefined;
      const max =
        adjustment.axis === "width"
          ? document.fieldProfile.widthYards / 2 - 1
          : 30;
      const value = Math.min(
        max,
        Math.max(adjustment.axis === "width" ? 0 : 1, adjustment.yards),
      );
      label = `${adjustment.position === "corners" ? "Corner" : "Safety"} ${adjustment.axis} — ${value} yards`;
      next = move(targets[adjustment.position], (man) =>
        adjustment.axis === "depth"
          ? { ...man.position, depthYards: value }
          : { ...man.position, lateralYards: ball + side(man) * value },
      );
      break;
    }
    case "read": {
      const man = targets.all.find((man) => man.id === adjustment.playerId);
      if (!man) return undefined;
      const target = document.players.find(
        (player) =>
          player.id === adjustment.targetId && player.unit !== "defense",
      );
      if (
        adjustment.read &&
        adjustment.perspective === "defensive-read" &&
        !target
      )
        return undefined;
      next = removeCoaching(document, man.id, (assignment) =>
        assignment.actions.some(
          (action) =>
            action.kind === "read" &&
            action.perspective === adjustment.perspective,
        ),
      );
      label = `${adjustment.perspective === "offense-key" ? "Offense read key" : "Defensive read"}${adjustment.read ? ` — ${readKeyName(adjustment.read)}` : " — cleared"}`;
      if (adjustment.read)
        next = {
          ...next,
          assignments: [
            ...next.assignments,
            {
              id: createId("assignment"),
              playerId: man.id,
              text: `${label}${target && adjustment.perspective === "defensive-read" ? `: watch ${target.label || target.role || "the offensive player"}` : ""}`,
              actions: [
                {
                  id: createId("action"),
                  kind: "read",
                  perspective: adjustment.perspective,
                  read: adjustment.read,
                  ...(target && adjustment.perspective === "defensive-read"
                    ? {
                        target: {
                          kind: "player",
                          playerId: target.id,
                        } as const,
                      }
                    : {}),
                },
              ],
            },
          ],
        };
      break;
    }
    case "plaster": {
      const man = targets.all.find((man) => man.id === adjustment.playerId);
      if (!man) return undefined;
      const target = coverableReceivers(document).find(
        (receiver) => receiver.player.id === adjustment.targetId,
      )?.player;
      if (adjustment.targetId && !target) return undefined;
      next = removeCoaching(document, man.id, (assignment) =>
        assignment.actions.some((action) => action.kind === "plaster"),
      );
      label = target
        ? `Plaster ${target.label || "receiver"} on scramble`
        : "Clear plaster";
      if (target) {
        const id = createId("path");
        next = {
          ...next,
          paths: [
            ...next.paths,
            {
              id,
              playerId: man.id,
              kind: "zone",
              variant: "alternate",
              trigger: "scramble",
              points: [man.position, target.position],
              branches: [],
              style: { line: "dotted", ending: "arrow", color: "blue" },
              coachingNote: "On QB scramble",
            },
          ],
          assignments: [
            ...next.assignments,
            {
              id: createId("assignment"),
              playerId: man.id,
              text: `PLASTER ${target.label || "RECEIVER"} ON SCRAMBLE`,
              actions: [
                { id: createId("action"), kind: "movement", pathId: id },
                {
                  id: createId("action"),
                  kind: "plaster",
                  target: { kind: "player", playerId: target.id },
                },
              ],
            },
          ],
        };
      }
      break;
    }
  }
  next = settleDefensiveCoaching(next);
  if (canonicalStringify(next) === canonicalStringify(document))
    return undefined;
  return diffPlayDocuments(document, next, label);
}
