import { applyPlayCommand, type PlayDocument } from "@chalk/domain";
import {
  buildRenderScene,
  buildSvgRenderScene,
  estimateTextWidth,
  projectCoordinate,
  type SvgRenderScene,
  type SvgTextPrimitive,
} from "@chalk/render";
import { stickThunderPlay } from "@chalk/test-fixtures";
import { describe, expect, it } from "vitest";

/**
 * Where a route's words land on the paper (issue #158). Written down before
 * the geometry, one test per way it was found to fail or could:
 *
 * 1. A vertical route's assignment, conversion and note share one baseline.
 * 2. The words straddle a vertical route.
 * 3. The words run off the left edge of the paper.
 * 4. The words run off the right edge of the paper.
 * 5. The words run off the top of the paper.
 * 6. The words run off the bottom of the paper.
 * 7. A whole paragraph is printed on the field, and the table loses it.
 * 8. The fix moves a route across the field off where the original draws it.
 * 9. Two routes' words print over each other with nothing behind them.
 * 10. A hand-placed label lands on a route's words with nothing behind it.
 */

const FRAME = { width: 1000, height: 620 };
const NOTE = "Win the release; stack him by twelve and look early.";
const CONVERSION = "Fade vs press; out vs cushion.";

interface Point {
  readonly lateralYards: number;
  readonly depthYards: number;
}

interface Coached {
  readonly playerId: "x" | "f";
  readonly points: readonly Point[];
  readonly assignment?: string;
  readonly readOrder?: number;
  readonly conversion?: string;
  readonly coachingNote?: string;
}

/** X's and F's seeded routes, redrawn as given with the Coach's words. */
function coachedPlay(...routes: readonly Coached[]): PlayDocument {
  const pathOf = { x: "rx", f: "rf" } as const;
  return applyPlayCommand(stickThunderPlay, {
    kind: "batch",
    commands: routes.flatMap((route) => {
      const pathId = pathOf[route.playerId];
      const base = stickThunderPlay.paths.find(({ id }) => id === pathId)!;
      return [
        {
          kind: "update-path" as const,
          path: {
            ...base,
            points: route.points.map((point) => ({ ...point })),
            ...(route.readOrder === undefined
              ? {}
              : { readOrder: route.readOrder }),
            ...(route.conversion === undefined
              ? {}
              : { conversion: route.conversion }),
            ...(route.coachingNote === undefined
              ? {}
              : { coachingNote: route.coachingNote }),
          },
        },
        ...(route.assignment === undefined
          ? []
          : [
              {
                kind: "insert-assignments" as const,
                assignments: [
                  {
                    index: stickThunderPlay.assignments.length,
                    item: {
                      id: `assignment_${route.playerId}`,
                      playerId: route.playerId,
                      text: route.assignment,
                      actions: [
                        {
                          id: `action_${route.playerId}`,
                          kind: "movement" as const,
                          pathId,
                        },
                      ],
                    },
                  },
                ],
              },
            ]),
      ];
    }),
  });
}

const stance = (playerId: "x" | "f"): Point =>
  stickThunderPlay.players.find(({ id }) => id === playerId)!.position;

/** Straight up the field from his stance, the way a Go is drawn. */
const vertical = (playerId: "x" | "f", yards = 14): readonly Point[] => {
  const from = stance(playerId);
  return [from, { ...from, depthYards: from.depthYards + yards }];
};

const everything = {
  assignment: "COMET FADE-OUT",
  readOrder: 1,
  conversion: CONVERSION,
  coachingNote: NOTE,
};

const drawn = (play: PlayDocument) =>
  buildSvgRenderScene(buildRenderScene(play));
const wordsOf = (scene: SvgRenderScene, pathId: string) =>
  scene.paths.find(({ id }) => id === pathId)!.coaching!;

/** The box a line of type takes up, as the renderer estimates it. */
function boxOf(text: SvgTextPrimitive) {
  const width = estimateTextWidth(text.text, text.fontSize, text.letterSpacing);
  const left =
    text.textAnchor === "start"
      ? text.x
      : text.textAnchor === "end"
        ? text.x - width
        : text.x - width / 2;
  return {
    left,
    right: left + width,
    top: text.y - text.fontSize * 0.8,
    bottom: text.y + text.fontSize * 0.25,
  };
}

const overlap = (a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe("where a route's words land", () => {
  it("does not put a vertical route's assignment, conversion and note on one baseline", () => {
    const scene = drawn(
      coachedPlay({ playerId: "x", points: vertical("x"), ...everything }),
    );
    const { notes } = wordsOf(scene, "rx");
    expect(notes.map(({ id }) => id)).toEqual([
      "rx-assignment",
      "rx-conversion",
      "rx-note",
    ]);
    for (let index = 1; index < notes.length; index += 1) {
      const above = notes[index - 1]!.text;
      const below = notes[index]!.text;
      // A full line apart, not a fraction of a pixel.
      expect(Math.abs(below.y - above.y)).toBeGreaterThanOrEqual(
        Math.max(above.fontSize, below.fontSize),
      );
    }
  });

  it("does not let the words straddle a vertical route", () => {
    const scene = drawn(
      coachedPlay({ playerId: "x", points: vertical("x"), ...everything }),
    );
    const tip = projectCoordinate(vertical("x").at(-1)!, scene.viewport);
    const { notes, read } = wordsOf(scene, "rx");
    // The read is on one side of the line; every line of words is wholly
    // on the other, clear of the line itself.
    const readSide = Math.sign(read!.center.x - tip.x);
    expect(readSide).not.toBe(0);
    for (const { text } of notes) {
      const box = boxOf(text);
      if (readSide > 0) expect(box.right).toBeLessThan(tip.x - 4);
      else expect(box.left).toBeGreaterThan(tip.x + 4);
    }
  });

  it("keeps the words on the paper at the left edge", () => {
    const from = { ...stance("x"), lateralYards: -26 };
    const scene = drawn(
      coachedPlay({
        playerId: "x",
        points: [from, { ...from, depthYards: from.depthYards + 14 }],
        ...everything,
      }),
    );
    for (const { text } of wordsOf(scene, "rx").notes) {
      expect(boxOf(text).left).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps the words on the paper at the right edge", () => {
    // Across the field toward the near sideline: the words are centred
    // under the line, and the line ends a few feet from the paint.
    const tip = { lateralYards: 25, depthYards: 6 };
    const scene = drawn(
      coachedPlay({
        playerId: "x",
        points: [{ lateralYards: 26.5, depthYards: 6 }, tip],
        ...everything,
      }),
    );
    for (const { text } of wordsOf(scene, "rx").notes) {
      expect(boxOf(text).right).toBeLessThanOrEqual(FRAME.width);
    }
  });

  it("keeps the words on the paper at the top", () => {
    // Across the field at the top of the paper: the words go above the line.
    const scene = drawn(
      coachedPlay({
        playerId: "x",
        points: [
          { lateralYards: -10, depthYards: 34 },
          { lateralYards: 0, depthYards: 34 },
        ],
        ...everything,
      }),
    );
    for (const { text } of wordsOf(scene, "rx").notes) {
      expect(boxOf(text).top).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps the words on the paper at the bottom", () => {
    // Back toward his own goal line at the foot of the paper: the words go
    // below the line.
    const scene = drawn(
      coachedPlay({
        playerId: "x",
        points: [
          { lateralYards: 0, depthYards: -15 },
          { lateralYards: -10, depthYards: -15 },
        ],
        ...everything,
      }),
    );
    for (const { text } of wordsOf(scene, "rx").notes) {
      expect(boxOf(text).bottom).toBeLessThanOrEqual(FRAME.height);
    }
  });

  it("cuts a paragraph short on the field and keeps every word for the table", () => {
    const paragraph =
      "Win the release inside, stack him by twelve, look early for the ball on the fade.";
    const play = coachedPlay({
      playerId: "x",
      points: vertical("x"),
      ...everything,
      coachingNote: paragraph,
    });
    const scene = drawn(play);
    const note = wordsOf(scene, "rx").notes.find(
      ({ id }) => id === "rx-note",
    )!.text;
    expect(note.text.length).toBeLessThan(paragraph.length);
    expect(note.text.endsWith("…")).toBe(true);
    // Cut between words, never through one.
    expect(paragraph.startsWith(note.text.slice(0, -1))).toBe(true);
    expect(paragraph.charAt(note.text.length - 1)).toMatch(/[\s,;:]/);
    // The field is not where the words live: the scene under it still
    // carries the whole note for the table and the inspector.
    expect(
      buildRenderScene(play).paths.find(({ id }) => id === "rx")!.coachingNote,
    ).toBe(paragraph);
  });

  it("draws a route across the field with its words where the original puts them", () => {
    const end = { lateralYards: 0, depthYards: 5 };
    const scene = drawn(
      coachedPlay({
        playerId: "x",
        points: [{ lateralYards: -10, depthYards: 5 }, end],
        ...everything,
      }),
    );
    const tip = projectCoordinate(end, scene.viewport);
    const { notes, read } = wordsOf(scene, "rx");
    // The read hangs 20 below the line; the words start 22 above it and
    // step up a line (the label size plus 5) at a time, centred on the tip.
    expect(read!.center).toEqual({ x: tip.x, y: tip.y + 20 });
    notes.forEach(({ text }, index) => {
      expect(text.x).toBeCloseTo(tip.x, 6);
      expect(text.textAnchor ?? "middle").toBe("middle");
      expect(text.y).toBeCloseTo(tip.y - 22 - index * 17, 6);
    });
  });

  it("puts a backing behind words that land on another route's words", () => {
    const scene = drawn(
      coachedPlay(
        { playerId: "x", points: vertical("x"), ...everything },
        {
          playerId: "f",
          points: vertical("f"),
          assignment: "COMET RETURN",
          readOrder: 3,
          coachingNote: "Sit down at twelve if the hook drops.",
        },
      ),
    );
    const notes = [
      ...wordsOf(scene, "rx").notes,
      ...wordsOf(scene, "rf").notes,
    ];
    const collisions = notes.flatMap((first, index) =>
      notes
        .slice(index + 1)
        .filter((second) => overlap(boxOf(first.text), boxOf(second.text)))
        .map((second) => [first, second] as const),
    );
    // Two men a couple of yards apart with the same words cannot both be
    // read unless one of them is backed.
    expect(collisions.length).toBeGreaterThan(0);
    for (const [first, second] of collisions) {
      const backing = first.backing ?? second.backing;
      expect(backing?.kind).toBe("rect");
      expect(backing?.fill).toBe("#FFFFFF");
    }
  });

  it("puts a backing behind a hand-placed label that lands on a route's words", () => {
    const play = coachedPlay({
      playerId: "x",
      points: vertical("x"),
      ...everything,
    });
    const tip = vertical("x").at(-1)!;
    const seeded = stickThunderPlay.labels[0]!;
    const onTheWords = {
      ...play,
      labels: [
        {
          ...seeded,
          id: "l-on-words",
          text: "5 Yds",
          size: 11,
          box: "none" as const,
          position: {
            lateralYards: tip.lateralYards - 2.5,
            depthYards: tip.depthYards,
          },
        },
      ],
    };
    const scene = drawn(onTheWords);
    const label = scene.labels.find(({ id }) => id === "l-on-words")!;
    expect(label.box?.kind).toBe("rect");
    expect(label.box?.fill).toBe("#FFFFFF");
    // A label the Coach boxed himself keeps his box.
    const outlined = drawn({
      ...onTheWords,
      labels: [{ ...onTheWords.labels[0]!, box: "outline" as const }],
    }).labels.find(({ id }) => id === "l-on-words")!;
    expect(outlined.box?.kind).toBe("rect");
    expect(outlined.box?.stroke).toBeDefined();
  });
});
