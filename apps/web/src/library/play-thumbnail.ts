import {
  coverageForDrop,
  PLAY_THUMBNAIL_RENDERER_VERSION,
  opposingUnit,
  playThumbnailKey,
  type Color,
  type Coordinate,
  type MovementPath,
  type PlayDocument,
  type PlayThumbnailTheme,
  type Player,
} from "@chalk/domain";
import { coverageFills } from "@chalk/render";

const tenth = (value: number): number => Number(value.toFixed(1));

/** The card's frame: wide like a play sheet, in the proportions of a field cut. */
const WIDTH = 160;
const HEIGHT = 90;
const INSET = 6;

/** The field the art is drawn on: turf under lights, not paper. */
const TURF = "#0c1117";
const YARD_LINE = "rgba(255, 255, 255, 0.10)";
const TEN_YARD_LINE = "rgba(255, 255, 255, 0.18)";
const SCRIMMAGE = "rgba(255, 255, 255, 0.55)";
const OFFENSE_MAN = "#f5f5f5";
const DEFENSE_MAN = "#d7dbe2";
/** The other unit under this Play: there, but not what the card is about. */
const SHADOW_OPACITY = 0.3;

/**
 * The editor's line colours, lifted for a dark ground: ink becomes chalk,
 * and the rest brighten just enough to hold against turf.
 */
const LINE_COLORS: Readonly<Record<Color, string>> = Object.freeze({
  ink: "#f5f5f5",
  blue: "#4f8dff",
  red: "#ff5a5f",
  green: "#6fd07a",
  orange: "#ff9f43",
  gray: "#9aa4b2",
  yellow: "#ffd93d",
});

/** A spot on the card's field: yards across the ball, and downfield as up. */
interface Point {
  readonly x: number;
  readonly y: number;
}

interface Frame {
  readonly project: (x: number, y: number) => Point;
  readonly scale: number;
}

/** Yards, with downfield up the card: what the Coach sees standing behind the offense. */
const spot = (at: Coordinate): Point => ({
  x: at.lateralYards,
  y: -at.depthYards,
});

/**
 * The frame the art is projected in: true yards, cropped to everything on
 * the Play — men, lines and the ground each zone owns — with a little turf
 * around it, and a floor on the crop so a tight formation is not blown up to
 * fill the card. Downfield is up, the way play art reads.
 */
function frameFor(
  points: readonly Point[],
  extents: readonly {
    readonly at: Point;
    readonly rx: number;
    readonly ry: number;
  }[],
): Frame {
  const xs = [
    ...points.map(({ x }) => x),
    ...extents.flatMap(({ at, rx }) => [at.x - rx, at.x + rx]),
  ];
  const ys = [
    ...points.map(({ y }) => y),
    ...extents.flatMap(({ at, ry }) => [at.y - ry, at.y + ry]),
  ];
  const minX = Math.min(...xs, -9) - 1.5;
  const maxX = Math.max(...xs, 9) + 1.5;
  const minY = Math.min(...ys, -7) - 1;
  const maxY = Math.max(...ys, 2.5) + 1;
  const scale = Math.min(
    (WIDTH - INSET * 2) / (maxX - minX),
    (HEIGHT - INSET * 2) / (maxY - minY),
  );
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return {
    scale,
    project: (x, y) => ({
      x: tenth(WIDTH / 2 + (x - centerX) * scale),
      y: tenth(HEIGHT / 2 + (y - centerY) * scale),
    }),
  };
}

/** Yard lines every five yards across the card, the scrimmage line brightest. */
function fieldLines(frame: Frame): string {
  const lines: string[] = [];
  for (let step = -20; step <= 20; step += 1) {
    const y = frame.project(0, -step * 5).y;
    if (y < 0 || y > HEIGHT) continue;
    const stroke =
      step === 0 ? SCRIMMAGE : step % 2 === 0 ? TEN_YARD_LINE : YARD_LINE;
    lines.push(
      `<line x1="0" x2="${WIDTH}" y1="${y}" y2="${y}" stroke="${stroke}" stroke-width="${step === 0 ? 1 : 0.7}"/>`,
    );
  }
  return lines.join("");
}

function dashFor(line: MovementPath["style"]["line"]): string {
  switch (line) {
    case "dashed":
      return ' stroke-dasharray="3 2"';
    case "dotted":
      return ' stroke-dasharray="1 1.6"';
    case "zigzag":
      return ' stroke-dasharray="2 1.2"';
    case "solid":
      return "";
  }
}

/** A small head on the last segment: an arrow, or a blocker's bar. */
function endingMark(
  ending: MovementPath["style"]["ending"],
  from: Point,
  to: Point,
  color: string,
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  if (ending === "arrow" || ending === "chevron") {
    const size = 3.2;
    const left = {
      x: tenth(to.x - ux * size - uy * size * 0.6),
      y: tenth(to.y - uy * size + ux * size * 0.6),
    };
    const right = {
      x: tenth(to.x - ux * size + uy * size * 0.6),
      y: tenth(to.y - uy * size - ux * size * 0.6),
    };
    return `<path d="M${left.x} ${left.y} L${to.x} ${to.y} L${right.x} ${right.y}" fill="none" stroke="${color}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (ending === "bar") {
    const size = 2.6;
    return `<line x1="${tenth(to.x - uy * size)}" y1="${tenth(to.y + ux * size)}" x2="${tenth(to.x + uy * size)}" y2="${tenth(to.y - ux * size)}" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>`;
  }
  if (ending === "dot" || ending === "square" || ending === "diamond") {
    return `<circle cx="${to.x}" cy="${to.y}" r="1.4" fill="${color}"/>`;
  }
  return "";
}

/** A man on the card, drawn solid as the symbol the Coach gave him. */
function manMark(player: Player, at: Point, color: string): string {
  const r = 2.7;
  switch (player.symbol) {
    case "square":
      return `<rect x="${tenth(at.x - r)}" y="${tenth(at.y - r)}" width="${tenth(r * 2)}" height="${tenth(r * 2)}" fill="${color}"/>`;
    case "triangle":
      return `<path d="M${at.x} ${tenth(at.y - r - 0.4)} L${tenth(at.x + r + 0.2)} ${tenth(at.y + r * 0.8)} L${tenth(at.x - r - 0.2)} ${tenth(at.y + r * 0.8)} Z" fill="${color}"/>`;
    case "x":
      return `<path d="M${tenth(at.x - r)} ${tenth(at.y - r)} L${tenth(at.x + r)} ${tenth(at.y + r)} M${tenth(at.x + r)} ${tenth(at.y - r)} L${tenth(at.x - r)} ${tenth(at.y + r)}" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>`;
    case "oval":
      return `<ellipse cx="${at.x}" cy="${at.y}" rx="${tenth(r * 1.3)}" ry="${r}" fill="${color}"/>`;
    case "none":
      return "";
    case "circle":
      return `<circle cx="${at.x}" cy="${at.y}" r="${r}" fill="${color}"/>`;
  }
}

/**
 * A card-sized picture of a Play, drawn the way a play sheet under lights
 * is: turf, yard lines, the men as their symbols, every line in its colour
 * with its head on, and the ground each zone owns as the field's own tinted
 * ellipse. The Play's unit is drawn full; the shadow beneath it is faded so
 * the card is about the Play and not the look it was drawn against.
 */
export function playThumbnailSvg(play: PlayDocument): string {
  const shadow = opposingUnit(play.unit);
  const playerById = new Map(play.players.map((player) => [player.id, player]));

  const men = play.players.map((player) => ({
    player,
    at: spot(player.position),
  }));
  const lines = play.paths.map((path) => {
    const points = path.points.map((point) => spot(point));
    const endpoint = points.at(-1);
    const owner = playerById.get(path.playerId);
    const zone =
      path.kind === "zone" && path.style.ending === "bubble" && endpoint
        ? (path.coverageArea ?? coverageForDrop(path.points.at(-1)!))
        : undefined;
    return {
      path,
      points,
      unit: owner?.unit ?? play.unit,
      zone:
        zone && endpoint
          ? {
              at: endpoint,
              rx: zone.radiusLateralYards,
              ry: zone.radiusDepthYards,
              fill: coverageFills[zone.type],
            }
          : undefined,
    };
  });

  const frame = frameFor(
    [...men.map(({ at }) => at), ...lines.flatMap(({ points }) => points)],
    lines.flatMap(({ zone }) => (zone ? [zone] : [])),
  );

  const group = (unit: Player["unit"], inner: string) =>
    inner
      ? `<g opacity="${unit === shadow ? SHADOW_OPACITY : 1}">${inner}</g>`
      : "";

  const zones = lines
    .map(({ unit, zone }) => {
      if (!zone) return "";
      const at = frame.project(zone.at.x, zone.at.y);
      const rx = tenth(zone.rx * frame.scale);
      const ry = tenth(zone.ry * frame.scale);
      return group(
        unit,
        `<ellipse cx="${at.x}" cy="${at.y}" rx="${rx}" ry="${ry}" fill="${zone.fill}" fill-opacity="0.34" stroke="${zone.fill}" stroke-opacity="0.9" stroke-width="0.9"/>`,
      );
    })
    .join("");

  const strokes = lines
    .map(({ path, points, unit }) => {
      const drawn = points.map(({ x, y }) => frame.project(x, y));
      if (drawn.length < 2) return "";
      const color = LINE_COLORS[path.style.color];
      const d = drawn
        .map(
          (point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`,
        )
        .join(" ");
      const head =
        path.style.ending === "bubble"
          ? ""
          : endingMark(
              path.style.ending,
              drawn[drawn.length - 2]!,
              drawn[drawn.length - 1]!,
              color,
            );
      return group(
        unit,
        `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"${dashFor(path.style.line)}/>${head}`,
      );
    })
    .join("");

  const marks = men
    .map(({ player, at }) =>
      group(
        player.unit,
        manMark(
          player,
          frame.project(at.x, at.y),
          player.unit === "defense" ? DEFENSE_MAN : OFFENSE_MAN,
        ),
      ),
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="${TURF}"/>${fieldLines(frame)}${zones}${strokes}${marks}</svg>`;
}

export function playThumbnailBlob(play: PlayDocument): Blob {
  return new Blob([playThumbnailSvg(play)], { type: "image/svg+xml" });
}

export function thumbnailKeyForPlay(
  play: PlayDocument,
  documentHash: string,
  theme: PlayThumbnailTheme = "light",
): string {
  return playThumbnailKey({
    playId: play.id,
    revisionHash: documentHash,
    rendererVersion: PLAY_THUMBNAIL_RENDERER_VERSION,
    fieldProfileRevision: play.fieldProfile.revision,
    theme,
  });
}
