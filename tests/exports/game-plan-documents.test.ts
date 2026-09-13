import {
  addCalls,
  assignCallCode,
  createGamePlan,
  placeCallInSection,
  prepareGamePlan,
  starterExamplePlays,
  type GamePlan,
  type PlayDocument,
} from "@chalk/domain";
import {
  gamePlanCallSheetHtml,
  gamePlanHandoutHtml,
  gamePlanWristbandHtml,
  preparedStamp,
  type DiagramOptions,
  type DiagramRenderer,
} from "@chalk/exports";
import { describe, expect, it } from "vitest";

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

const plays = starterExamplePlays();
const stick = plays[0]!;
const verts = plays.find(({ id }) => id === "play_four_verticals")!;
const coverThree = plays.find(({ id }) => id === "play_cover_3_fire_zone")!;
const T0 = Date.UTC(2026, 8, 13, 12);
let counter = 0;
const createId = (prefix: string) => `${prefix}_${(counter += 1)}`;
const code = (plan: GamePlan, callId: string, value: string): GamePlan => {
  const result = assignCallCode(plan, callId, value, T0 + 5);
  if (!result.ok) throw new Error(result.reason);
  return result.plan;
};
const sourcesOf = (docs: readonly PlayDocument[]) =>
  new Map(
    docs.map((document) => [
      document.id,
      { document, documentHash: `hash_${document.id}` },
    ]),
  );

/**
 * Week 3: Stick opens and also answers on third down under the same number,
 * Four Verticals is a third-down call, and a Play the Coach since deleted
 * still holds its number.
 */
function weekThree() {
  let plan = createGamePlan({
    playbookId: stick.playbookId,
    name: 'Week 3 <"Central">',
    unit: "offense",
    opponent: "Central & Sons",
    gameLabel: "Homecoming",
    nowMs: T0,
    sections: ["Openers", "3rd down"],
    createId,
  });
  const [openers, third] = plan.sections.map(({ id }) => id) as [
    string,
    string,
  ];
  const added = addCalls(plan, [stick.id, coverThree.id], {
    nowMs: T0 + 1,
    sectionId: openers,
    createId,
  });
  plan = added.plan;
  const [stickCall, goneCall] = added.callIds as [string, string];
  const more = addCalls(plan, [verts.id], {
    nowMs: T0 + 2,
    sectionId: third,
    createId,
  });
  plan = placeCallInSection(more.plan, stickCall, third, 0, T0 + 3);
  plan = code(plan, stickCall, "12");
  plan = code(plan, goneCall, "7");
  const prepared = prepareGamePlan(plan, sourcesOf([stick, verts]), {
    nowMs: T0 + 10,
    label: "Thursday",
    createId,
  });
  return { plan: prepared.plan, revision: prepared.revision };
}

describe("game plan call sheet", () => {
  it("prints sections in order, one code per call wherever it answers, and flags a missing Play", () => {
    const { revision } = weekThree();
    const html = gamePlanCallSheetHtml(revision);
    expect(html).toContain('<h1>Week 3 &lt;"Central"&gt;</h1>');
    expect(html).toContain(
      "Homecoming · vs Central &amp; Sons · Offense · Prepared 13 Sep 2026 · Thursday",
    );
    expect(html.indexOf("<h2>Openers</h2>")).toBeLessThan(
      html.indexOf("<h2>3rd down</h2>"),
    );
    const openers = html.slice(
      html.indexOf("<h2>Openers</h2>"),
      html.indexOf("<h2>3rd down</h2>"),
    );
    const third = html.slice(html.indexOf("<h2>3rd down</h2>"));
    expect(openers).toContain(
      '<span class="cc">12</span><span>Stick — Thunder</span>',
    );
    expect(openers).toContain(
      '<span class="cc">7</span><span>Missing play <em class="mp">missing</em></span>',
    );
    expect(third).toContain(
      '<span class="cc">12</span><span>Stick — Thunder</span>',
    );
    expect(third).toContain(
      '<span class="cc">—</span><span>Four Verticals</span>',
    );
    expect(html.match(/class="cc">12</g)?.length).toBe(2);
    expect(html.match(/class="wl"/g)?.length).toBe(12);
    expect(html).toContain("@page{size:letter landscape;margin:0.4in}");
  });

  it("lists calls no section claims under Unsectioned, last", () => {
    let plan = createGamePlan({
      playbookId: stick.playbookId,
      name: "Loose",
      unit: "offense",
      nowMs: T0,
      sections: ["Openers"],
      createId,
    });
    plan = addCalls(plan, [stick.id], { nowMs: T0 + 1, createId }).plan;
    const { revision } = prepareGamePlan(plan, sourcesOf([stick]), {
      nowMs: T0 + 2,
      createId,
    });
    const html = gamePlanCallSheetHtml(revision);
    expect(html.indexOf("<h2>Openers</h2>")).toBeLessThan(
      html.indexOf("<h2>Unsectioned</h2>"),
    );
    expect(preparedStamp(revision)).toBe("Prepared 13 Sep 2026");
  });
});

describe("game plan wristband", () => {
  it("cuts cells in plan order wearing their codes, stops at the band, keeps a missing Play's number", () => {
    const { revision } = weekThree();
    const render = recordingRenderer();
    const html = gamePlanWristbandHtml(revision, { render });
    expect(render.calls.map(({ playId }) => playId)).toEqual([
      stick.id,
      verts.id,
    ]);
    expect(render.calls[0]?.options).toEqual({
      typePreset: "print",
      lineWeight: 1.5,
      layers: { text: false, assigns: false, notes: false, reads: false },
    });
    const cells = html.match(/<div class="wc/g) ?? [];
    expect(cells).toHaveLength(3);
    expect(
      html.indexOf('<span class="cc">12</span> Stick — Thunder'),
    ).toBeLessThan(html.indexOf('<span class="cc">7</span> Missing play'));
    expect(html).toContain('<div class="wc miss">');
    expect(html).toContain('<span class="cc">—</span> Four Verticals');
    expect(html).toContain("grid-template-columns:2.1in 2.1in");
  });

  it("stops at the band's cell count", () => {
    let plan = createGamePlan({
      playbookId: stick.playbookId,
      name: "Many",
      unit: "offense",
      nowMs: T0,
      createId,
    });
    const many = [...plays, { ...stick, id: "play_stick_copy" }];
    plan = addCalls(
      plan,
      many.map(({ id }) => id),
      { nowMs: T0 + 1, createId },
    ).plan;
    expect(plan.calls.length).toBeGreaterThan(8);
    const { revision } = prepareGamePlan(plan, sourcesOf(many), {
      nowMs: T0 + 2,
      createId,
    });
    const render = recordingRenderer();
    gamePlanWristbandHtml(revision, { render });
    expect(render.calls).toHaveLength(8);
    render.calls.length = 0;
    gamePlanWristbandHtml(revision, { render, cells: 4 });
    expect(render.calls).toHaveLength(4);
  });
});

describe("game plan handout", () => {
  it("binds cover, contents by section with codes and pages, one page per Play", () => {
    const { revision } = weekThree();
    const render = recordingRenderer();
    const html = gamePlanHandoutHtml(revision, {
      render,
      formations: [],
      year: 2026,
    });
    expect(render.calls.map(({ playId }) => playId)).toEqual([
      stick.id,
      verts.id,
    ]);
    expect(html).toContain('<div class="pg cov">');
    expect(html).toContain(
      "Homecoming · vs Central &amp; Sons · Offense · Prepared 13 Sep 2026 · Thursday",
    );
    expect(html).toContain("2026 season · 3 calls");
    const contents = html.slice(
      html.indexOf("<h1>Contents</h1>"),
      html.indexOf('<div class="pg">', html.indexOf("<h1>Contents</h1>") + 1),
    );
    expect(contents).toContain('<div class="tc">Openers</div>');
    expect(contents).toContain('<div class="tc">3rd down</div>');
    // Stick is listed twice, both times pointing at its one page.
    expect(
      contents.match(/class="cc">12<\/span> · Stick — Thunder/g)?.length,
    ).toBe(2);
    expect(contents.match(/<span class="tp">3<\/span>/g)?.length).toBe(2);
    expect(contents).toContain('class="cc">—</span> · Four Verticals');
    expect(contents).toContain('<span class="tp">4</span>');
    expect(contents).toContain(
      'class="cc">7</span> · Missing play <em class="mp">missing</em></span><i></i><span class="tp">—</span>',
    );
    expect(html).toContain(
      '<h1><span class="cc">12</span> Stick — Thunder</h1>',
    );
    expect(html).toContain('<h1><span class="cc">—</span> Four Verticals</h1>');
    expect(html.match(/<div class="pno">/g)?.length).toBe(2);
    expect(html).toContain("<title>Week 3 &lt;");
  });

  it("gives an empty plan a cover and an empty contents rather than nothing", () => {
    const plan = createGamePlan({
      playbookId: stick.playbookId,
      name: "Bye week",
      unit: "defense",
      nowMs: T0,
      createId,
    });
    const { revision } = prepareGamePlan(plan, new Map(), {
      nowMs: T0 + 1,
      createId,
    });
    const render = recordingRenderer();
    const html = gamePlanHandoutHtml(revision, { render, year: 2026 });
    expect(render.calls).toHaveLength(0);
    expect(html).toContain("<h1>Bye week</h1>");
    expect(html).toContain("2026 season · 0 calls");
    expect(html).toContain("<h1>Contents</h1>");
    expect(html).not.toContain('class="pno"');
  });
});
