import { applyPlayCommand } from "@chalk/domain";
import {
  buildRenderScene,
  buildSvgRenderScene,
  defaultPresentation,
  withoutShadow,
  type Presentation,
} from "@chalk/render";
import {
  playerLabelPrimitivePlay,
  stickThunderPlay,
} from "@chalk/test-fixtures";
import { describe, expect, it } from "vitest";

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

const presented = (play: typeof stickThunderPlay, presentation: Presentation) =>
  buildSvgRenderScene(buildRenderScene(play, { presentation }));

describe("type presets", () => {
  it("drops conversions and notes under Player type while Coach still draws them", () => {
    const coach = presented(coached, defaultPresentation).paths.find(
      ({ id }) => id === "rx",
    )!.coaching!;
    const player = presented(coached, {
      ...defaultPresentation,
      typePreset: "player",
    }).paths.find(({ id }) => id === "rx")!.coaching!;

    expect(coach.notes.map(({ id }) => id)).toEqual([
      "rx-assignment",
      "rx-conversion",
      "rx-note",
    ]);
    expect(player.notes.map(({ id }) => id)).toEqual(["rx-assignment"]);
  });

  it("prints in ink — no colour fills — when the Print preset is on", () => {
    const scene = presented(playerLabelPrimitivePlay, {
      ...defaultPresentation,
      typePreset: "print",
    });
    const filled = scene.players[1]!;

    expect(filled.shapes[1]?.kind === "path" ? filled.shapes[1].fill : "").toBe(
      "#171717",
    );
    expect(
      scene.labels.find(({ id }) => id === "label-alert")?.leader?.stroke,
    ).toBe("#171717");
    expect(
      scene.labels.find(({ id }) => id === "label-progression")?.box,
    ).toMatchObject({ stroke: "#171717" });
  });
});

describe("page kinds", () => {
  it("keeps the players where they stand when the markings change", () => {
    const full = presented(stickThunderPlay, defaultPresentation);
    const half = presented(stickThunderPlay, {
      ...defaultPresentation,
      pageKind: "half",
    });
    const blank = presented(stickThunderPlay, {
      ...defaultPresentation,
      pageKind: "blank",
    });
    const quarterback = (scene: typeof full) =>
      scene.players.find(({ id }) => id === "q")?.position;

    expect(quarterback(half)).toEqual(quarterback(full));
    expect(quarterback(blank)).toEqual(quarterback(full));
  });

  it("clips Half field to the band around the line of scrimmage", () => {
    const half = presented(stickThunderPlay, {
      ...defaultPresentation,
      pageKind: "half",
    });

    expect(half.field.yardLines.map(({ id }) => id)).toEqual([
      "yard-line--15",
      "yard-line--10",
      "yard-line--5",
      "yard-line-0",
      "yard-line-5",
      "yard-line-10",
      "yard-line-15",
    ]);
  });

  it("draws Scout card as the LOS alone, Playbook page as light lines, Blank as nothing", () => {
    const card = presented(stickThunderPlay, {
      ...defaultPresentation,
      pageKind: "card",
    });
    const book = presented(stickThunderPlay, {
      ...defaultPresentation,
      pageKind: "book",
    });
    const blank = presented(stickThunderPlay, {
      ...defaultPresentation,
      pageKind: "blank",
    });

    expect(card.field.style).toBe("los");
    expect(card.field.yardLines).toHaveLength(1);
    expect(card.field.yardLines[0]?.isLineOfScrimmage).toBe(true);
    expect(card.field.sidelines).toEqual([]);
    expect(card.field.hashMarks).toEqual([]);
    expect(card.field.numbers).toEqual([]);

    expect(book.field.style).toBe("light");
    expect(book.field.yardLines).toHaveLength(9);
    expect(book.field.sidelines).toEqual([]);
    expect(book.field.hashMarks).toEqual([]);
    expect(book.field.numbers).toEqual([]);

    expect(blank.field.style).toBe("blank");
    expect(blank.field.yardLines).toEqual([]);
    expect(blank.field.sidelines).toEqual([]);
  });
});

describe("annotation layers", () => {
  it("lets each family drop off the field without touching the others", () => {
    const hide = (layer: keyof Presentation["layers"]): Presentation => ({
      ...defaultPresentation,
      layers: { ...defaultPresentation.layers, [layer]: false },
    });

    const withoutReads = presented(coached, hide("reads")).paths.find(
      ({ id }) => id === "rx",
    )!.coaching!;
    const withoutAssigns = presented(coached, hide("assigns")).paths.find(
      ({ id }) => id === "rx",
    )!.coaching!;
    const withoutNotes = presented(coached, hide("notes")).paths.find(
      ({ id }) => id === "rx",
    )!.coaching!;
    const withoutText = presented(stickThunderPlay, hide("text"));

    expect(withoutReads.read).toBeUndefined();
    expect(withoutReads.notes.map(({ id }) => id)).toEqual([
      "rx-assignment",
      "rx-conversion",
      "rx-note",
    ]);
    expect(withoutAssigns.notes.map(({ id }) => id)).toEqual([
      "rx-conversion",
      "rx-note",
    ]);
    expect(withoutNotes.notes.map(({ id }) => id)).toEqual(["rx-assignment"]);
    expect(withoutText.labels).toEqual([]);
    expect(
      presented(stickThunderPlay, defaultPresentation).labels,
    ).toHaveLength(12);
  });
});

describe("the other unit's shadow (ADR 0053)", () => {
  const shadowed = {
    ...playerLabelPrimitivePlay,
    paths: [
      ...playerLabelPrimitivePlay.paths,
      {
        id: "drop-x",
        kind: "zone" as const,
        playerId: "player-x",
        points: [
          { lateralYards: 8, depthYards: 4 },
          { lateralYards: 12, depthYards: 10 },
        ],
        branches: [],
        style: {
          line: "dashed" as const,
          ending: "bubble" as const,
          color: "blue" as const,
        },
      },
    ],
    labels: [
      ...playerLabelPrimitivePlay.labels,
      {
        ...playerLabelPrimitivePlay.labels[0]!,
        id: "label-shadow",
        unit: "defense" as const,
      },
    ],
  };

  it("draws the shadow unless asked not to, and never edits the play", () => {
    const whole = buildRenderScene(shadowed);
    expect(whole.players.map(({ unit }) => unit)).toContain("defense");
    expect(whole.paths.map(({ id }) => id)).toContain("drop-x");
    expect(whole.labels.map(({ id }) => id)).toContain("label-shadow");

    const alone = buildRenderScene(shadowed, {
      presentation: { ...defaultPresentation, hideShadow: true },
    });
    expect(alone.players.map(({ unit }) => unit)).not.toContain("defense");
    expect(alone.players).toHaveLength(4);
    expect(alone.paths.map(({ id }) => id)).not.toContain("drop-x");
    expect(alone.paths.map(({ id }) => id)).toContain("binding-path");
    expect(alone.labels.map(({ id }) => id)).not.toContain("label-shadow");
    expect(alone.labels).toHaveLength(playerLabelPrimitivePlay.labels.length);
    expect(shadowed.players).toHaveLength(6);
  });

  it("shadows the offense on a defensive play", () => {
    const defensive = { ...shadowed, unit: "defense" as const };
    const alone = buildRenderScene(defensive, {
      presentation: { ...defaultPresentation, hideShadow: true },
    });
    expect(alone.players.map(({ unit }) => unit)).toEqual([
      "defense",
      "defense",
    ]);
    expect(alone.paths.map(({ id }) => id)).toEqual(["drop-x"]);
    expect(alone.labels.map(({ id }) => id)).toEqual(["label-shadow"]);
    expect(withoutShadow(defensive).players).toHaveLength(2);
  });
});
