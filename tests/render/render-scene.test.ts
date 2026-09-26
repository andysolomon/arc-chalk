import { applyPlayCommand } from "@chalk/domain";
import { buildRenderScene, buildSvgRenderScene } from "@chalk/render";
import { stickThunderPlay } from "@chalk/test-fixtures";
import { describe, expect, it } from "vitest";

describe("RenderScene", () => {
  it("draws a stored line that runs past the paint on the sideline instead", () => {
    // A Play saved before the sidelines held its lines may still carry a
    // break past the paint. It is drawn on the paint, so nothing bleeds over
    // the boundary, and the line inside the paint is exactly as drawn.
    const half = stickThunderPlay.fieldProfile.widthYards / 2;
    const stored = {
      ...stickThunderPlay,
      paths: stickThunderPlay.paths.map((path, index) =>
        index === 0
          ? {
              ...path,
              points: path.points.map((point, pi) =>
                pi === path.points.length - 1
                  ? { ...point, lateralYards: -half - 8 }
                  : point,
              ),
            }
          : path,
      ),
    };
    const scene = buildRenderScene(stored);
    const rendered = buildSvgRenderScene(scene);
    const [left, right] = rendered.field.sidelines.map(({ x1 }) => x1);
    const held = scene.paths[0]!.points.at(-1)!;
    expect(held.lateralYards).toBe(-half);
    expect(held.depthYards).toBe(
      stickThunderPlay.paths[0]!.points.at(-1)!.depthYards,
    );
    // Every coordinate pair in every stroke's path data lands between the
    // two drawn sidelines.
    for (const path of rendered.paths) {
      for (const stroke of path.strokes) {
        const numbers = stroke.d.match(/-?\d+(?:\.\d+)?/g) ?? [];
        expect(numbers.length % 2).toBe(0);
        for (let index = 0; index < numbers.length; index += 2) {
          const x = Number(numbers[index]);
          expect(x).toBeGreaterThanOrEqual(left!);
          expect(x).toBeLessThanOrEqual(right!);
        }
      }
    }
  });
});

describe("what a route says about itself", () => {
  /** The seeded X route, with everything a Coach can write on one. */
  const coached = applyPlayCommand(stickThunderPlay, {
    kind: "batch",
    commands: [
      {
        kind: "update-path",
        path: {
          ...stickThunderPlay.paths.find(({ id }) => id === "rx")!,
          readOrder: 2,
          conversion: "vs man: fade",
          coachingNote: "Push vertical off the release",
        },
      },
      {
        kind: "insert-assignments",
        assignments: [
          {
            index: stickThunderPlay.assignments.length,
            item: {
              id: "assignment_x",
              playerId: "x",
              text: "Stick",
              actions: [{ id: "action_x", kind: "movement", pathId: "rx" }],
            },
          },
        ],
      },
    ],
  });

  it("hangs the read and the words on opposite sides of the line", () => {
    const scene = buildSvgRenderScene(buildRenderScene(coached));
    const path = scene.paths.find(({ id }) => id === "rx")!;
    const coaching = path.coaching;
    const tip = path.strokes[0]!.d.split(" ").slice(-2).map(Number);

    const readSide = coaching!.read!.center.x - tip[0]!;
    const wordSide = coaching!.notes[0]!.text.x - tip[0]!;
    expect(Math.sign(readSide)).toBe(-Math.sign(wordSide));
    expect(readSide).not.toBe(0);
    expect(wordSide).not.toBe(0);
  });

  it("stacks the words evenly away from the line", () => {
    const coaching = buildSvgRenderScene(buildRenderScene(coached)).paths.find(
      ({ id }) => id === "rx",
    )!.coaching!;
    const between = (first: number, second: number) =>
      Math.hypot(
        coaching.notes[second]!.text.x - coaching.notes[first]!.text.x,
        coaching.notes[second]!.text.y - coaching.notes[first]!.text.y,
      );

    expect(between(0, 1)).toBeGreaterThan(0);
    expect(between(0, 1)).toBeCloseTo(between(1, 2), 6);
  });
});
