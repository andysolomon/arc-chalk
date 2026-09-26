import type { DefensiveCall } from "./defense-catalogue";
import { classifyZoneCoverage } from "./geometry";
import { DEEP_STANCE_YARDS, defenderKind } from "./man-coverage";
import type { CoverageDepths, FormationSlot } from "./schema";

/**
 * How far off the ball a Coach wants his corners and his deep safeties
 * (ADR 0061), the way a video game's coach adjustments set them once for the
 * whole team: every call he puts on the field, and every reset back to one,
 * stands them at those depths. A depth he has not set is the call's own.
 *
 * Corners stop at seven yards: a Cover 0 corner lines up on his man no
 * deeper than that, so a deeper choice would be one the field could not
 * keep.
 */
export const CORNER_DEPTH_CHOICES: readonly number[] = Object.freeze([
  1, 2, 3, 4, 5, 6, 7,
]);
export const SAFETY_DEPTH_CHOICES: readonly number[] = Object.freeze([
  8, 9, 10, 11, 12, 13, 14, 15, 16,
]);

/**
 * Which depth, if any, a call's man takes. A corner is read off his letter;
 * a safety is a deep one when his drop in the call is deep, or when the call
 * gives him nothing and stands him deep — a safety rolled down into the box
 * or in man is where the call wants him and keeps his spot.
 */
function depthFor(
  call: DefensiveCall,
  slot: FormationSlot,
  depths: CoverageDepths,
): number | undefined {
  const kind = defenderKind(slot, 0);
  if (kind === "corner") return depths.cornerYards;
  if (kind !== "safety" || depths.safetyYards === undefined) return undefined;
  const lines = call.assignments.filter(({ slotId }) => slotId === slot.id);
  const deep =
    lines.length === 0
      ? slot.position.depthYards >= DEEP_STANCE_YARDS
      : lines.some(
          ({ kind: line, points }) =>
            line === "drop" &&
            points.length > 0 &&
            classifyZoneCoverage(points.at(-1)!) === "deep",
        );
  return deep ? depths.safetyYards : undefined;
}

/**
 * A call with its corners and deep safeties at the Coach's depths. Only the
 * man moves: each line he runs starts from his new stance and still ends
 * where the call sends him, so a drop keeps its landmark and a blitz its
 * gap. Nothing set is the call itself.
 */
export function defensiveCallAt(
  call: DefensiveCall,
  depths: CoverageDepths | undefined,
): DefensiveCall {
  if (depths?.cornerYards === undefined && depths?.safetyYards === undefined) {
    return call;
  }
  const moved = new Map<string, number>();
  for (const slot of call.formation.slots) {
    const depth = depthFor(call, slot, depths);
    if (depth !== undefined && depth !== slot.position.depthYards) {
      moved.set(slot.id, depth);
    }
  }
  if (moved.size === 0) return call;
  return {
    ...call,
    formation: {
      ...call.formation,
      slots: call.formation.slots.map((slot) => {
        const depthYards = moved.get(slot.id);
        return depthYards === undefined
          ? slot
          : { ...slot, position: { ...slot.position, depthYards } };
      }),
    },
    assignments: call.assignments.map((assignment) => {
      const depthYards = moved.get(assignment.slotId);
      const [first, ...rest] = assignment.points;
      if (depthYards === undefined || !first) return assignment;
      return { ...assignment, points: [{ ...first, depthYards }, ...rest] };
    }),
  };
}

/** Every call in a catalogue at the Coach's depths. */
export function defensiveCallsAt(
  calls: readonly DefensiveCall[],
  depths: CoverageDepths | undefined,
): readonly DefensiveCall[] {
  if (depths?.cornerYards === undefined && depths?.safetyYards === undefined) {
    return calls;
  }
  return calls.map((call) => defensiveCallAt(call, depths));
}
