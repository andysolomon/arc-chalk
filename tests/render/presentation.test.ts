import { applyPlayCommand } from "@chalk/domain";
import {
  buildRenderScene,
  buildSvgRenderScene,
  defaultPresentation,
  effectiveLayers,
  labelFontSize,
  pageKindSpec,
  resolveTypeDensity,
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
  it("opens on the original's Coach density", () => {
    expect(resolveTypeDensity()).toEqual({
      name: "Coach",
      label: 12,
      read: 13,
      notes: true,
      flat: false,
      hint: "Dense — reads, assignments, conversions and notes all on the field.",
    });
    expect(labelFontSize(11)).toBe(11);
  });

  it("scales Player and Print off Coach's 12, and Present by 1.25×", () => {
    expect(
      resolveTypeDensity({ ...defaultPresentation, typePreset: "player" }),
    ).toMatchObject({ label: 15, read: 17, notes: false, flat: false });
    expect(
      resolveTypeDensity({ ...defaultPresentation, typePreset: "print" }),
    ).toMatchObject({ label: 13, read: 14, notes: true, flat: true });
    expect(
      resolveTypeDensity({ ...defaultPresentation, present: true }),
    ).toMatchObject({ label: 15, read: 16 });
    expect(labelFontSize(11, 15)).toBe(14);
    expect(labelFontSize(11, 13)).toBe(12);
  });

  it("draws the Assignment at the preset's label size and the read at its read size", () => {
    const coach = presented(coached, defaultPresentation).paths.find(
      ({ id }) => id === "rx",
    )!.coaching!;
    const player = presented(coached, {
      ...defaultPresentation,
      typePreset: "player",
    }).paths.find(({ id }) => id === "rx")!.coaching!;

    expect(coach.notes[0]?.text.fontSize).toBe(12);
    expect(coach.read?.text.fontSize).toBe(13);
    expect(player.notes[0]?.text.fontSize).toBe(15);
    expect(player.read?.text.fontSize).toBe(17);
    // Player type drops conversions and notes; the Assignment stays.
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

  it("clips Half field to the original's band and leaves Full field's 30-yard window", () => {
    expect(pageKindSpec("half").window.maxDepthYards).toBeCloseTo(
      (430 - 196) / 12,
      9,
    );
    expect(pageKindSpec("half").window.minDepthYards).toBeCloseTo(
      (430 - 620) / 12,
      9,
    );

    const full = presented(stickThunderPlay, defaultPresentation);
    const half = presented(stickThunderPlay, {
      ...defaultPresentation,
      pageKind: "half",
    });

    expect(full.field.yardLines).toHaveLength(9);
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

  it("keeps the Notes toggle on under Player type while still hiding the notes", () => {
    const player: Presentation = {
      ...defaultPresentation,
      typePreset: "player",
    };
    expect(player.layers.notes).toBe(true);
    expect(effectiveLayers(player).notes).toBe(false);
  });
});
