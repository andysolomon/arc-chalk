import {
  classifyZoneCoverage,
  legacyCanvasToYards,
  legacyDepthSpanToYards,
  legacyLateralSpanToYards,
  type ZoneCoverageType,
} from "./geometry";
import { highSchoolFieldProfile } from "./field-profile";
import { migratePlayDocument } from "./migrations";
import {
  playDocumentV2Schema,
  type Color,
  type PathEnding,
  type PathLine,
  type PlayDocument,
} from "./schema";

type LegacyPoint = {
  x: number;
  y: number;
  cx?: number;
  cy?: number;
  tick?: boolean;
  ls?: string;
  em?: string;
};
type LegacyStyle = { lineStyle?: string; endMarker?: string; color?: string };
type LegacyPlayer = {
  id: string;
  x: number;
  y: number;
  symbol?: string;
  label?: string;
  sub?: string;
  fill?: string;
  color?: string;
  side?: string;
  role?: string;
  group?: string;
};
type LegacyRoute = LegacyStyle & {
  id: string;
  kind?: string;
  playerId: string;
  points: LegacyPoint[];
  branches?: Array<LegacyStyle & { fromIdx: number; points: LegacyPoint[] }>;
  zone?: { rx: number; ry: number; t?: string };
  assignment?: string;
  rule?: string;
  delay?: number;
  speed?: number;
  hold?: number;
};
type LegacyLabel = {
  id: string;
  x: number;
  y: number;
  text: string;
  color?: string;
  size?: number;
  box?: string;
  boxColor?: string;
  caps?: boolean;
  mono?: boolean;
  role?: string;
  side?: string;
  leader?: { x: number; y: number; style?: string };
  bind?: {
    routeId: string;
    segIdx: number;
    t?: number;
    ox?: number;
    oy?: number;
  };
};
export interface LegacyPlay {
  id: string;
  name: string;
  cat: string;
  tags?: string[];
  notes?: string;
  doc: {
    players: LegacyPlayer[];
    routes: LegacyRoute[];
    labels: LegacyLabel[];
  };
}

const colors: Record<string, Color> = {
  k: "ink",
  b: "blue",
  r: "red",
  y: "yellow",
  gr: "green",
  o: "orange",
  g: "gray",
};
const color = (value = "k") => colors[value] ?? "ink";
const playerSymbol = (value = "circle") => {
  switch (value) {
    case "square":
    case "oval":
    case "triangle":
    case "x":
    case "none":
      return value;
    default:
      return "circle";
  }
};
const playerFill = (value = "none") =>
  value === "half" || value === "solid" ? value : "none";
const labelBox = (value = "none") => {
  switch (value) {
    case "outline":
    case "fill":
    case "circle":
      return value;
    default:
      return "none";
  }
};
const labelRole = (value?: string) => {
  switch (value) {
    case "landmark":
    case "assignment":
    case "progression":
    case "adjustment":
    case "alert":
    case "coaching":
      return value;
    default:
      return undefined;
  }
};
const line = (value = "solid"): PathLine =>
  value === "dashed" || value === "dotted" || value === "zigzag"
    ? value
    : "solid";
const ending = (value = "arrow"): PathEnding => {
  switch (value) {
    case "bar":
    case "dot":
    case "none":
    case "bubble":
    case "hook":
    case "chevron":
    case "diamond":
    case "square":
      return value;
    default:
      return "arrow";
  }
};
const unitFor = (category: string): "offense" | "defense" | "special-teams" =>
  category === "Defense"
    ? "defense"
    : category === "Special"
      ? "special-teams"
      : "offense";
const point = (value: LegacyPoint) => ({
  ...legacyCanvasToYards(value),
  ...(value.cx === undefined || value.cy === undefined
    ? {}
    : { control: legacyCanvasToYards({ x: value.cx, y: value.cy }) }),
  ...(value.tick === undefined ? {} : { tick: value.tick }),
  ...(value.ls === undefined && value.em === undefined
    ? {}
    : {
        segmentStyle: {
          ...(value.ls === undefined ? {} : { line: line(value.ls) }),
          ...(value.em === undefined ? {} : { ending: ending(value.em) }),
        },
      }),
});
const style = (value: LegacyStyle) => ({
  line: line(value.lineStyle),
  ending: ending(value.endMarker),
  color: color(value.color),
});

function coverageType(route: LegacyRoute): ZoneCoverageType {
  const explicit = route.zone?.t;
  if (
    explicit === "deep" ||
    explicit === "curl" ||
    explicit === "flat" ||
    explicit === "spy" ||
    explicit === "hook"
  )
    return explicit;

  const endpoint = route.points.at(-1);
  if (!endpoint) return "hook";
  return classifyZoneCoverage(
    legacyCanvasToYards(endpoint),
    legacyLateralSpanToYards(route.zone?.rx ?? 0),
  );
}

export function migrateLegacyPlay(legacy: LegacyPlay): PlayDocument {
  return migratePlayDocument(
    playDocumentV2Schema.parse({
      schemaVersion: 2,
      id: legacy.id,
      name: legacy.name,
      unit: unitFor(legacy.cat),
      playType: legacy.cat,
      tags: legacy.tags ?? [],
      notes: legacy.notes ?? "",
      fieldProfile: highSchoolFieldProfile,
      players: legacy.doc.players.map((player) => ({
        id: player.id,
        unit: player.side === "def" ? "defense" : unitFor(legacy.cat),
        position: legacyCanvasToYards(player),
        symbol: playerSymbol(player.symbol),
        label: player.label ?? "",
        sublabel: player.sub ?? "",
        fill: playerFill(player.fill),
        color: color(player.color),
        ...(player.role === undefined ? {} : { role: player.role }),
        ...(player.group === undefined ? {} : { group: player.group }),
      })),
      paths: legacy.doc.routes.map((route, routeIndex) => ({
        id: route.id,
        kind: route.kind ?? "route",
        playerId: route.playerId,
        points: route.points.map(point),
        branches: (route.branches ?? []).map((branch) => ({
          fromIndex: branch.fromIdx,
          points: branch.points.map(point),
          style: style(branch),
        })),
        style: style(route),
        ...(route.kind !== undefined && route.kind !== "route"
          ? {}
          : legacy.doc.routes
                .slice(0, routeIndex)
                .some(
                  (candidate) =>
                    candidate.playerId === route.playerId &&
                    (candidate.kind === undefined ||
                      candidate.kind === "route"),
                )
            ? { variant: "alternate" as const }
            : {}),
        ...(route.zone
          ? {
              coverageArea: {
                type: coverageType(route),
                radiusLateralYards: legacyLateralSpanToYards(route.zone.rx),
                radiusDepthYards: legacyDepthSpanToYards(route.zone.ry),
              },
            }
          : {}),
        ...(route.assignment ? { assignment: route.assignment } : {}),
        ...(route.rule ? { rule: route.rule } : {}),
        ...(route.delay !== undefined ||
        route.speed !== undefined ||
        route.hold !== undefined
          ? {
              timing: {
                delayMs: Math.round((route.delay ?? 0) * 1000),
                holdMs: Math.round((route.hold ?? 0) * 1000),
                ...(route.speed === undefined
                  ? {}
                  : { speedMultiplier: route.speed }),
              },
            }
          : {}),
      })),
      labels: legacy.doc.labels.map((label) => {
        const role = labelRole(label.role);
        return {
          id: label.id,
          position: legacyCanvasToYards(label),
          text: label.text,
          color: color(label.color),
          size: label.size ?? 11,
          box: labelBox(label.box),
          boxColor: color(label.boxColor ?? "y"),
          ...(label.caps === undefined ? {} : { caps: label.caps }),
          ...(label.mono === undefined ? {} : { mono: label.mono }),
          ...(role === undefined ? {} : { role }),
          ...(label.side === "def" ? { unit: "defense" } : {}),
          ...(label.leader === undefined
            ? {}
            : {
                leader: {
                  endpoint: legacyCanvasToYards(label.leader),
                  line: label.leader.style === "dashed" ? "dashed" : "solid",
                },
              }),
          ...(label.bind === undefined
            ? {}
            : {
                binding: {
                  pathId: label.bind.routeId,
                  segmentIndex: label.bind.segIdx,
                  progress: label.bind.t ?? 0.5,
                  offset: {
                    lateralYards: legacyLateralSpanToYards(label.bind.ox ?? 0),
                    depthYards: -legacyDepthSpanToYards(label.bind.oy ?? 0),
                  },
                },
              }),
        };
      }),
    }),
  );
}
