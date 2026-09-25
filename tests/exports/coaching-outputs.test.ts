import { stickThunderPlay, type PlayDocument } from "@chalk/domain";
import {
  callSheetGroups,
  groupMembers,
  installPageHtml,
  libraryOrder,
  playMeta,
  playRows,
  playbookHtml,
  positionViewHtml,
  practiceCardPlays,
  progressionStrip,
  quizHtml,
  quizPlay,
  scoutCardPlays,
  wristbandHtml,
  type DiagramOptions,
  type DiagramRenderer,
} from "@chalk/exports";
import {
  defensiveCoverThreePlay,
  defensivePlaybookGolden,
  offensivePlaybookGolden,
  offensiveStickThunderPlay,
} from "@chalk/test-fixtures";
import { describe, expect, it } from "vitest";

/**
 * A renderer that records what it was asked for. The documents are about
 * what they ask of the one renderer and how they lay the answer out, not
 * about the drawing itself — that is the render package's to prove.
 */
function recordingRenderer(): DiagramRenderer & {
  readonly calls: {
    readonly playId: string;
    readonly options: DiagramOptions;
  }[];
} {
  const calls: { playId: string; options: DiagramOptions }[] = [];
  const render = ((play: PlayDocument, options: DiagramOptions = {}) => {
    calls.push({ playId: play.id, options });
    return `<svg viewBox="0 0 1000 620" data-play="${play.id}"></svg>`;
  }) as DiagramRenderer & { calls: typeof calls };
  render.calls = calls;
  return render;
}

/** The golden Stick with read numbers and a check-down the strip can show. */
const readPlay: PlayDocument = {
  ...offensiveStickThunderPlay,
  paths: offensiveStickThunderPlay.paths.map((path) =>
    path.id === "ry"
      ? {
          ...path,
          readOrder: 1,
          conversion: "Sit vs zone",
          coachingNote: "Win the apex.",
        }
      : path.id === "rf"
        ? { ...path, readOrder: 2 }
        : path.id === "rx"
          ? { ...path, readOrder: 3 }
          : path,
  ),
  assignments: offensiveStickThunderPlay.assignments.map((assignment) =>
    assignment.playerId === "h"
      ? { ...assignment, text: "Check release to the flat." }
      : assignment,
  ),
};

const concept = offensivePlaybookGolden.concepts[0]!;

describe("coaching rows", () => {
  it("orders the install table in football order, not document order", () => {
    const rows = playRows(readPlay);
    expect(rows.map((row) => row.role)).toEqual(["RB", "H", "X", "Z", "TE"]);
    expect(rows.map((row) => row.who)).toEqual(["H", "F", "X", "Z", "Y"]);
    expect(rows[0]?.assignment).toBe("Check release to the flat.");
    // The unlettered line has no routes, so it has no rows.
    expect(rows.some((row) => row.role === "C")).toBe(false);
  });

  it("orders a progression by read and closes an unnumbered check", () => {
    const strip = progressionStrip(readPlay);
    const first = strip.indexOf("1 ");
    const second = strip.indexOf("  →  2 ");
    const third = strip.indexOf("  →  3 ");
    expect(first).toBe(0);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
    expect(strip.endsWith("  →  CHECK")).toBe(true);
    expect(progressionStrip(stickThunderPlay)).toBe("");
  });

  it("reads personnel, formation, strength and hash off the men", () => {
    const meta = playMeta(readPlay, offensivePlaybookGolden.formations);
    expect(meta.personnel).toBe("11P");
    expect(meta.formation).toBe(offensivePlaybookGolden.formations[0]!.name);
    expect(meta.strength).toBe("balanced");
    expect(meta.hash).toBe("middle");
  });

  it("finds a position group by role and the defense by unit", () => {
    expect(groupMembers(readPlay, "rec").map(({ id }) => id)).toEqual([
      "x",
      "y",
      "z",
    ]);
    expect(groupMembers(readPlay, "line")).toHaveLength(5);
    expect(groupMembers(readPlay, "def")).toHaveLength(0);
    expect(groupMembers(defensiveCoverThreePlay, "def").length).toBeGreaterThan(
      0,
    );
  });

  it("keeps only landmark labels on the quiz diagram", () => {
    const labelled: PlayDocument = {
      ...readPlay,
      labels: [
        { ...readPlay.labels[0]!, id: "l1", role: "landmark" },
        { ...readPlay.labels[0]!, id: "l2", role: "coaching" },
        { ...readPlay.labels[0]!, id: "l3" },
      ],
    };
    expect(quizPlay(labelled).labels.map(({ id }) => id)).toEqual(["l1", "l3"]);
  });

  it("keeps a Concept's Plays together in library order", () => {
    const solo: PlayDocument = {
      ...readPlay,
      id: "solo",
      conceptSource: undefined,
    };
    const variation: PlayDocument = {
      ...readPlay,
      id: "var",
      name: "Stick — Lightning",
    };
    const ordered = libraryOrder([readPlay, solo, variation], [concept]);
    expect(ordered.map(({ play }) => play.id)).toEqual([
      readPlay.id,
      "var",
      "solo",
    ]);
    expect(ordered[0]?.leadsConcept).toBe(true);
    expect(ordered[1]?.leadsConcept).toBe(false);
    expect(ordered[1]?.concept?.name).toBe("Stick");
  });

  it("groups the call sheet by tag, borrowing the Concept's, then by Unit · Type", () => {
    const untagged: PlayDocument = {
      ...readPlay,
      id: "u",
      name: "Untagged",
      tags: [],
    };
    const loner: PlayDocument = {
      ...readPlay,
      id: "l",
      name: "Loner",
      tags: [],
      conceptSource: undefined,
    };
    const groups = callSheetGroups([loner, readPlay, untagged], [concept]);
    // The Play's own tags first, the borrowed Concept tags next, and the
    // classification fallback sorted to the end whatever order it arrived in.
    expect(groups.map(({ name }) => name)).toEqual([
      "3rd down",
      "red zone",
      "third-down",
      "quick-game",
      "Offense · Pass",
    ]);
    expect(groups[2]?.plays.map(({ name }) => name)).toEqual(["Untagged"]);
    expect(groups[4]?.plays.map(({ name }) => name)).toEqual(["Loner"]);
  });
});

describe("teaching documents", () => {
  it("fades the other groups on the position view instead of removing them", () => {
    const render = recordingRenderer();
    const html = positionViewHtml(readPlay, "rec", { render })!;
    expect(html).not.toContain("<b>H</b>");
    expect(html).toContain("<b>X</b>");
    expect([...render.calls[0]!.options.emphasisPlayerIds!]).toEqual([
      "x",
      "y",
      "z",
    ]);
    expect(positionViewHtml(readPlay, "def", { render })).toBeUndefined();
  });

  it("prints the quiz and its answer key row for row", () => {
    const render = recordingRenderer();
    const html = quizHtml(readPlay, { render })!;
    const [quiz, key] = html.split("<h1>Answer key</h1>");
    const blanks = quiz!.match(
      /<td class="n">(\d+)<\/td><td class="w">([^<]+)<\/td><td class="bl"><\/td>/g,
    )!;
    const answers = key!.match(
      /<td class="n">(\d+)<\/td><td class="w">([^<]+)<\/td><td>/g,
    )!;
    expect(blanks).toHaveLength(5);
    expect(answers).toHaveLength(5);
    expect(
      blanks.map((row) => row.replace('<td class="bl"></td>', "<td>")),
    ).toEqual(answers);
    expect(render.calls[0]?.options).toEqual({
      typePreset: "print",
      layers: { reads: false, assigns: false, notes: false },
    });
    expect(render.calls[1]?.options).toEqual({ typePreset: "print" });
    expect(
      quizHtml({ ...readPlay, paths: [], assignments: [] }, { render }),
    ).toBeUndefined();
  });
});

describe("field documents", () => {
  it("stops the legacy wristband at eight cells and prints nothing when empty", () => {
    const render = recordingRenderer();
    expect(wristbandHtml([], { render })).toBeUndefined();
    const html = wristbandHtml(
      Array.from({ length: 12 }, () => readPlay),
      { render },
    )!;
    expect(html.match(/class="wc"/g)?.length).toBe(8);
    expect(render.calls).toHaveLength(8);
    expect(render.calls[0]?.options.layers).toEqual({
      text: false,
      assigns: false,
      notes: false,
      reads: false,
    });
  });

  it("draws scout cards from the defense, falling back to the open play", () => {
    const plays = scoutCardPlays(
      [readPlay, ...defensivePlaybookGolden.plays],
      readPlay,
    );
    expect(plays.map(({ id }) => id)).toEqual([defensiveCoverThreePlay.id]);
    expect(scoutCardPlays([readPlay], readPlay)).toEqual([readPlay]);
  });

  it("puts the open Play first on the practice cards", () => {
    const other: PlayDocument = { ...stickThunderPlay, id: "other" };
    const plays = practiceCardPlays([other, readPlay], readPlay);
    expect(plays.map(({ id }) => id)).toEqual([readPlay.id, "other"]);
  });
});

describe("playbook", () => {
  it("numbers each play after the cover and contents, and builds nothing from an empty book", () => {
    const render = recordingRenderer();
    expect(playbookHtml([], { render, year: 2026 })).toBeUndefined();
    const variation: PlayDocument = {
      ...readPlay,
      id: "var",
      name: "Stick — Lightning",
    };
    const html = playbookHtml([readPlay, variation], {
      render,
      concepts: [concept],
      year: 2026,
    })!;
    expect(html).toContain(
      '<span>Stick — Thunder</span><i></i><span class="tp">3</span>',
    );
    expect(html).toContain(
      'style="padding-left:14px"><span>Stick — Lightning</span><i></i><span class="tp">4</span>',
    );
    expect(html.match(/class="pno"/g)?.length).toBe(2);
    expect(html).toContain('<div class="pno">4</div>');
    expect(html.match(/class="pg/g)?.length).toBe(4);
    expect(render.calls).toHaveLength(2);
  });

  it("numbers every play of a long book after the cover and contents", () => {
    const render = recordingRenderer();
    const plays = Array.from({ length: 40 }, (_, index) => ({
      ...readPlay,
      id: `play_${index}`,
      name: `Play ${index + 1}`,
      conceptSource: undefined,
    }));
    const html = playbookHtml(plays, { render, year: 2026 })!;
    expect(html.match(/class="pno"/g)?.length).toBe(40);
    expect(html).toContain('<div class="pno">42</div>');
    expect(render.calls).toHaveLength(40);
  });
});

describe("standalone SVG", () => {
  it("escapes a name so a quote cannot break a sheet", () => {
    const render = recordingRenderer();
    const html = installPageHtml(
      { ...readPlay, name: 'Mesh <Alert> & "Go"' },
      { render },
    );
    expect(html).toContain('<h1>Mesh &lt;Alert&gt; &amp; "Go"</h1>');
    expect(html).not.toContain("<Alert>");
  });
});
