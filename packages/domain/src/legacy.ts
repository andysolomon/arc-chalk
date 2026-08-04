import { legacyCanvasToYards } from "./geometry";
import { playDocumentSchema, type PlayDocument } from "./schema";

type LegacyPoint = {
  x: number;
  y: number;
  cx?: number;
  cy?: number;
  tick?: boolean;
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

const colors: Record<string, "ink" | "blue" | "red" | "green" | "yellow"> = {
  k: "ink",
  b: "blue",
  r: "red",
  g: "green",
  y: "yellow",
};
const color = (value = "k") => colors[value] ?? "ink";
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
});
const style = (value: LegacyStyle) => ({
  line: (value.lineStyle ?? "solid") as "solid",
  ending: (value.endMarker ?? "arrow") as "arrow",
  color: color(value.color),
});

export function migrateLegacyPlay(legacy: LegacyPlay): PlayDocument {
  return playDocumentSchema.parse({
    schemaVersion: 1,
    id: legacy.id,
    name: legacy.name,
    unit: unitFor(legacy.cat),
    playType: legacy.cat,
    tags: legacy.tags ?? [],
    notes: legacy.notes ?? "",
    fieldProfile: {
      id: "field_high_school",
      name: "High school",
      widthYards: 160 / 3,
      endZoneDepthYards: 10,
      hashOffsetYards: 53 + 4 / 12,
    },
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
    paths: legacy.doc.routes.map((route) => ({
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
