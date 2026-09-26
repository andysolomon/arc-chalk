import {
  coverageForDrop,
  LEGACY_FIELD_GEOMETRY,
  yardsToLegacyCanvas,
  type DefensiveAssignment,
  type DefensiveCall,
} from "@chalk/domain";
import { coverageFills } from "@chalk/render";

/**
 * A card for a call carries the front and the secondary in their real
 * relationship, and with assignments on it shows the very lines that will
 * land on the field — so a Coach knows the call at a glance rather than by
 * its name. The arithmetic is the original's own, in the frame it measured in.
 */
export function defenseThumbnail(
  call: DefensiveCall,
  withAssignments: boolean,
): {
  readonly defenders: readonly { x: number; y: number }[];
  readonly line: readonly { x: number; y: number }[];
  readonly art: readonly { points: string; stroke: string; dash?: string }[];
  readonly areas: readonly {
    x: number;
    y: number;
    radiusX: number;
    radiusY: number;
    fill: string;
  }[];
  readonly lineOfScrimmage: number;
} {
  const drawn = call.formation.slots.map((slot) =>
    yardsToLegacyCanvas(slot.position),
  );
  const xs = drawn.map(({ x }) => x);
  const ys = drawn.map(({ y }) => y);
  const middle = (Math.min(...xs) + Math.max(...xs)) / 2;
  const spanX = Math.max(760, Math.max(...xs) - Math.min(...xs) + 90);
  const scaleX = 172 / spanX;
  const top = Math.min(...ys) - 22;
  const spanY = Math.max(230, Math.max(...ys) - top + 26);
  const scaleY = Math.min(scaleX * 1.15, 84 / spanY);
  const across = (x: number) => 90 + (x - middle) * scaleX;
  const down = (y: number) => 12 + (y - top) * scaleY;

  const crowd = new Map<number, number>();
  for (const y of ys) crowd.set(y, (crowd.get(y) ?? 0) + 1);
  // Ties go to the deeper row here, where a formation card takes the shallower
  // one: a defensive front stands off the ball, not on it.
  const busiest = [...crowd.entries()].sort(
    (left, right) => right[1] - left[1] || right[0] - left[0],
  )[0]![0];

  const strokes: Record<DefensiveAssignment["kind"], [string, string?]> = {
    drop: ["#0072F5", "2 2"],
    man: ["#0072F5", "1 2"],
    blitz: ["#E5484D", undefined],
  };
  const art = withAssignments
    ? call.assignments.map((assignment) => {
        const [stroke, dash] = strokes[assignment.kind];
        return {
          points: assignment.points
            .map((point) => {
              const at = yardsToLegacyCanvas(point);
              return `${across(at.x)},${down(at.y)}`;
            })
            .join(" "),
          stroke,
          ...(dash === undefined ? {} : { dash }),
        };
      })
    : [];

  const areas = withAssignments
    ? call.assignments.flatMap((assignment) => {
        if (assignment.kind !== "drop") return [];
        const end = assignment.points.at(-1)!;
        const area = coverageForDrop(end);
        const at = yardsToLegacyCanvas(end);
        return [
          {
            x: across(at.x),
            y: down(at.y),
            radiusX:
              area.radiusLateralYards *
              LEGACY_FIELD_GEOMETRY.lateralPixelsPerYard *
              scaleX,
            radiusY:
              area.radiusDepthYards *
              LEGACY_FIELD_GEOMETRY.depthPixelsPerYard *
              scaleY,
            fill: coverageFills[area.type],
          },
        ];
      })
    : [];

  return {
    defenders: drawn.map(({ x, y }) => ({ x: across(x), y: down(y) })),
    // The offense it is lined up against, drawn faintly, because a front only
    // means anything relative to the blockers in front of it.
    line: [428, 464, 500, 536, 572].map((x) => ({
      x: across(x),
      y: down(busiest + 44),
    })),
    art,
    areas,
    lineOfScrimmage: down(busiest + 30),
  };
}
