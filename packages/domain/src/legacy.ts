import { legacyCanvasToYards } from "./geometry";
import { highSchoolFieldProfile } from "./field-profile";
import {
  playDocumentSchema,
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
  side?: string;
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

function coverageType(
  route: LegacyRoute,
): "deep" | "curl" | "hook" | "flat" | "spy" {
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
  const depthYards = legacyCanvasToYards(endpoint).depthYards;
  const lateralPixels = Math.abs(endpoint.x - 500);
  if ((route.zone?.rx ?? 0) >= 88 || depthYards >= 13) return "deep";
  if (depthYards <= 2 && lateralPixels <= 70) return "spy";
  if (lateralPixels >= 210) return "flat";
  return depthYards >= 8 ? "curl" : "hook";
}

export function migrateLegacyPlay(legacy: LegacyPlay): PlayDocument {
  return playDocumentSchema.parse({
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
      unit: unitFor(legacy.cat),
      position: legacyCanvasToYards(player),
      symbol: player.symbol ?? "circle",
      label: player.label ?? "",
      sublabel: player.sub ?? "",
      fill: player.fill ?? "none",
      color: color(player.color),
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
                  (candidate.kind === undefined || candidate.kind === "route"),
              )
          ? { variant: "alternate" as const }
          : {}),
      ...(route.zone
        ? {
            coverageArea: {
              type: coverageType(route),
              radiusLateralYards: route.zone.rx / 12,
              radiusDepthYards: route.zone.ry / 12,
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
    labels: legacy.doc.labels.map((label) => ({
      id: label.id,
      position: legacyCanvasToYards(label),
      text: label.text,
      color: color(label.color),
      size: label.size ?? 11,
      box: label.box ?? "none",
      boxColor: color(label.boxColor ?? "y"),
      ...(label.caps === undefined ? {} : { caps: label.caps }),
      ...(label.side === "def" ? { unit: "defense" } : {}),
    })),
  });
}
