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

  it("hangs the read one way off the end of the line and the words the other", () => {
    const scene = buildSvgRenderScene(buildRenderScene(coached));
    const coaching = scene.paths.find(({ id }) => id === "rx")?.coaching;
    const tip = scene.paths
      .find(({ id }) => id === "rx")!
      .strokes[0]!.d.split(" ")
      .slice(-2)
      .map(Number);

    expect(coaching?.read?.text.text).toBe("2");
    expect(coaching?.read?.text.fill).toBe("#0072F5");
    // The read and the first of the words sit on opposite sides of the line.
    const readSide = coaching!.read!.center.x - tip[0]!;
    const wordSide = coaching!.notes[0]!.text.x - tip[0]!;
    expect(Math.sign(readSide)).toBe(-Math.sign(wordSide));

    expect(coaching?.notes.map(({ id }) => id)).toEqual([
      "rx-assignment",
      "rx-conversion",
      "rx-note",
    ]);
    // The Assignment is the loudest of the three, and shouts.
    expect(coaching?.notes[0]?.text).toMatchObject({
      text: "STICK",
      fill: "#4D4D4D",
      fontFamily: "Geist Mono, monospace",
      fontSize: 12,
    });
    expect(coaching?.notes[2]?.text).toMatchObject({
      text: "Push vertical off the release",
      fill: "#8F8F8F",
      fontFamily: "Geist, sans-serif",
      fontSize: 11,
    });
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

    expect(between(0, 1)).toBeCloseTo(between(1, 2), 6);
    // The original's step for its Coach density, carried into our frame.
    expect(between(0, 1)).toBeCloseTo(12 + 5, 6);
  });
});
