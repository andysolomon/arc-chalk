import { stickThunderPlay, type PlayDocument } from "@chalk/domain";
import {
  callSheetGroups,
  callSheetHtml,
  cropSvgToScoutCard,
  exportFileName,
  groupMembers,
  installPageHtml,
  libraryOrder,
  playMeta,
  playRows,
  playbookHtml,
  positionViewHtml,
  practiceCardPlays,
  practiceCardsHtml,
  progressionStrip,
  quizHtml,
  quizPlay,
  scoutCardPlays,
  scoutCardsHtml,
  slideHtml,
  standaloneSvg,
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

  it("writes the progression strip as text with a closing CHECK", () => {
    expect(progressionStrip(readPlay)).toBe(
      "1 RELEASE INSIDE AND RUN THE OVER BEHIND THE LINEBACKERS.  →  " +
        "2 SETTLE AT FIVE YARDS VERSUS ZONE; BREAK AWAY VERSUS MAN.  →  " +
        "3 PUSH TO THREE YARDS AND WIN TO THE FLAT.  →  CHECK",
    );
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

  it("groups the call sheet by tag, borrowing the Concept's, then by category", () => {
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
    // category fallback sorted to the end whatever order it arrived in.
    expect(groups.map(({ name }) => name)).toEqual([
      "3rd down",
      "red zone",
      "third-down",
      "quick-game",
      "Pass",
    ]);
    expect(groups[2]?.plays.map(({ name }) => name)).toEqual(["Untagged"]);
    expect(groups[4]?.plays.map(({ name }) => name)).toEqual(["Loner"]);
  });
});

describe("teaching documents", () => {
  it("lays the install page out on one letter-portrait sheet", () => {
    const render = recordingRenderer();
    const html = installPageHtml(readPlay, {
      render,
      concept,
      formations: offensivePlaybookGolden.formations,
      productName: "Chalk",
    });
    expect(html).toContain("<title>Stick — Thunder — install — Chalk</title>");
    expect(html.match(/@page\{/g)?.length).toBe(1);
    expect(html).toContain(
      '<div class="cn">Create a triangle on the apex defender.</div>',
    );
    expect(html).toContain('<thead><tr><th style="width:0.7in">Who</th>');
    expect(html).toContain(
      '<td class="w">H</td><td>Check release to the flat.</td>',
    );
    expect(html).toContain(
      '<span class="cv">— Sit vs zone</span></td><td>Win the apex.</td>',
    );
    expect(html).toContain('<div class="ps">1 RELEASE INSIDE');
    expect(html).toContain("<span>11P</span>");
    expect(html).toContain(
      "<span>strength balanced</span><span>middle hash</span>",
    );
    expect(html).toContain('<div class="__pn">Stick — Thunder · Pass</div>');
    expect(html).toContain('<div class="__pf">Chalk</div>');
    expect(render.calls).toEqual([
      { playId: readPlay.id, options: { typePreset: "print" } },
    ]);
    // Overflow flows to a second page with the header repeated, never clipped.
    expect(html).toContain("min-height:10in");
    expect(html).toContain("thead{display:table-header-group}");
  });

  it("fades the other groups on the position view instead of removing them", () => {
    const render = recordingRenderer();
    const html = positionViewHtml(readPlay, "rec", { render })!;
    expect(html).toContain("<span>Receivers</span>");
    expect(html).toContain('<div class="sec">Receivers assignments</div>');
    expect(html).toContain("font-size:15px");
    expect(html).not.toContain("<b>H</b>");
    expect(html).toContain("<b>X</b>");
    expect(render.calls[0]?.options.typePreset).toBe("print");
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
    expect(html).toContain(
      "td.bl{border-bottom:1px solid #8F8F8F;height:22px}",
    );
    expect(render.calls[0]?.options).toEqual({
      typePreset: "print",
      layers: { reads: false, assigns: false, notes: false },
    });
    expect(render.calls[1]?.options).toEqual({ typePreset: "print" });
    expect(
      quizHtml({ ...readPlay, paths: [], assignments: [] }, { render }),
    ).toBeUndefined();
  });

  it("builds the slide dark, 62/38, with at most three coaching points", () => {
    const render = recordingRenderer();
    const html = slideHtml(readPlay, { render, concept });
    expect(html).toContain(
      "@page{size:20in 11.25in;margin:0}body{background:#171717}",
    );
    expect(html).toContain(".dg{width:62%");
    expect(html).toContain(".tx{width:38%");
    expect(html).toContain("<h1>Stick — Thunder</h1>");
    expect(html).toContain(
      '<p class="scn">Create a triangle on the apex defender.</p>',
    );
    expect(html).toContain('<div class="sps">1 RELEASE INSIDE');
    expect(html).toContain('<div class="pt">— Win the apex.</div>');
    expect(render.calls[0]?.options).toEqual({ typePreset: "coach" });
  });
});

describe("field documents", () => {
  it("cuts the wristband into 2.1×1.4in cells with thin unlabeled routes", () => {
    const render = recordingRenderer();
    const html = wristbandHtml([readPlay, stickThunderPlay], { render })!;
    expect(html).toContain(
      ".wg{display:grid;grid-template-columns:2.1in 2.1in;grid-auto-rows:1.4in",
    );
    expect(html).toContain(
      ".wc{width:2.1in;height:1.4in;border:0.5px dashed #8F8F8F",
    );
    expect(html.match(/class="wc"/g)?.length).toBe(2);
    expect(html).toContain("<span>11P</span>");
    expect(render.calls[0]?.options).toEqual({
      typePreset: "print",
      lineWeight: 1.5,
      layers: { text: false, assigns: false, notes: false, reads: false },
    });
    expect(wristbandHtml([], { render })).toBeUndefined();
    expect(
      wristbandHtml(
        Array.from({ length: 12 }, () => readPlay),
        { render },
      )!.match(/class="wc"/g)?.length,
    ).toBe(8);
  });

  it("draws scout cards from the defense, cropped to the card band", () => {
    const render = recordingRenderer();
    const plays = scoutCardPlays(
      [readPlay, ...defensivePlaybookGolden.plays],
      readPlay,
    );
    expect(plays.map(({ id }) => id)).toEqual([defensiveCoverThreePlay.id]);
    expect(scoutCardPlays([readPlay], readPlay)).toEqual([readPlay]);
    const html = scoutCardsHtml(plays, { render })!;
    expect(html).toContain('<div class="no">1</div>');
    expect(html).toContain('viewBox="0 210 1000 410"');
    expect(html).toContain(
      ".sc{position:relative;height:2.28in;border:0.5px dashed #8F8F8F",
    );
    expect(render.calls[0]?.options).toEqual({
      typePreset: "print",
      pageKind: "card",
      layers: { reads: false, assigns: false, notes: false, text: true },
    });
  });

  it("prints practice cards 2-up with the open Play first and its strip", () => {
    const render = recordingRenderer();
    const other: PlayDocument = { ...stickThunderPlay, id: "other" };
    const plays = practiceCardPlays([other, readPlay], readPlay);
    expect(plays.map(({ id }) => id)).toEqual([readPlay.id, "other"]);
    const html = practiceCardsHtml(plays, { render });
    expect(html).toContain("grid-template-columns:1fr 1fr");
    expect(html.match(/class="card"/g)?.length).toBe(2);
    expect(html).toContain('<div class="ps">1 RELEASE INSIDE');
  });

  it("gives the call sheet a tag column each and twelve ruled lines", () => {
    const html = callSheetHtml([readPlay], { concepts: [concept] });
    expect(html).toContain("@page{size:letter landscape;margin:0.4in}");
    expect(html).toContain("<h2>3rd down</h2>");
    expect(html).toContain('<div class="row">Stick — Thunder</div>');
    expect(html).toContain("grid-template-columns:1fr 2.4in");
    expect(html.match(/class="wl"/g)?.length).toBe(12);
  });
});

describe("playbook", () => {
  it("builds cover, contents and a numbered install page per Play", () => {
    const render = recordingRenderer();
    const variation: PlayDocument = {
      ...readPlay,
      id: "var",
      name: "Stick — Lightning",
    };
    const html = playbookHtml([readPlay, variation], {
      render,
      concepts: [concept],
      year: 2026,
      productName: "Chalk",
    })!;
    expect(html).toContain("<title>Chalk — playbook — Chalk</title>");
    expect(html).toContain('<div class="cs">2026 season · 2 plays</div>');
    expect(html).toContain('<div class="tc">Stick</div>');
    expect(html).toContain(
      '<span>Stick — Thunder</span><i></i><span class="tp">3</span>',
    );
    expect(html).toContain(
      'style="padding-left:14px"><span>Stick — Lightning</span><i></i><span class="tp">4</span>',
    );
    expect(html.match(/class="pno"/g)?.length).toBe(2);
    expect(html).toContain('<div class="pno">4</div>');
    expect(html.match(/class="pg/g)?.length).toBe(4);
    expect(playbookHtml([], { render, year: 2026 })).toBeUndefined();
  });

  it("builds a 40-play book as one string in well under three seconds", () => {
    const render = recordingRenderer();
    const plays = Array.from({ length: 40 }, (_, index) => ({
      ...readPlay,
      id: `play_${index}`,
      name: `Play ${index + 1}`,
      conceptSource: undefined,
    }));
    const started = performance.now();
    const html = playbookHtml(plays, { render, year: 2026 })!;
    expect(performance.now() - started).toBeLessThan(3000);
    expect(html.match(/class="pno"/g)?.length).toBe(40);
    expect(html).toContain('<div class="pno">42</div>');
    expect(render.calls).toHaveLength(40);
  });
});

describe("standalone SVG", () => {
  it("fixes the file at 2000×1240 with the field stylesheet inlined", () => {
    const svg = standaloneSvg(
      '<svg class="field-diagram" role="img" aria-label="x" data-react-commits="2" data-field-style="light" viewBox="0 0 1000 620"><g/></svg>',
    );
    expect(
      svg.startsWith(
        '<svg xmlns="http://www.w3.org/2000/svg" data-field-style="light" width="2000" height="1240" viewBox="0 0 1000 620">',
      ),
    ).toBe(true);
    expect(svg).toContain("<style>.field-paper{fill:#fff;stroke:#e5e5e5}");
    expect(svg).toContain('<rect width="1000" height="620" fill="#fff"/>');
    expect(svg).not.toContain("field-diagram");
    expect(cropSvgToScoutCard(svg)).toContain(
      'height="820" viewBox="0 210 1000 410"',
    );
  });

  it("names files the way the original did, clock included", () => {
    expect(exportFileName("Stick — Thunder", "svg")).toBe(
      "Stick — Thunder.svg",
    );
    expect(exportFileName("", "png")).toBe("play.png");
    expect(exportFileName("Stick", "png", "−0.4s")).toBe("Stick -0.4s.png");
  });

  it("escapes a name so a quote cannot break a sheet", () => {
    const render = recordingRenderer();
    const html = installPageHtml(
      { ...readPlay, name: 'Mesh <Alert> & "Go"' },
      { render },
    );
    expect(html).toContain('<h1>Mesh &lt;Alert&gt; &amp; "Go"</h1>');
  });
});
