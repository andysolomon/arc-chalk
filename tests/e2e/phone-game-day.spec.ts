import type { Locator, Page } from "@playwright/test";

import { chooseWorkspaceView, expect, test } from "./fixtures";

/**
 * Game Day on a phone (issue #93): the selected call has the glass, the
 * calls fold behind one button, Previous / Next stay in reach, and long
 * plan, section and play names wrap rather than push the controls away.
 */
const VIEWPORTS = [
  { name: "360×800", width: 360, height: 800 },
  { name: "390×844", width: 390, height: 844 },
  { name: "430×932", width: 430, height: 932 },
  { name: "844×390", width: 844, height: 390 },
];

const PLAN = "Week 3 — Homecoming vs. Central Catholic Crusaders";
const SECTION = "Third and long — passing downs against two-high safeties";

const inside = async (
  locator: Locator,
  viewport: { width: number; height: number },
) => {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const what = (await locator.evaluate((node) => node.outerHTML)).slice(0, 160);
  expect(box, what).not.toBeNull();
  expect(box!.x, what).toBeGreaterThanOrEqual(-0.5);
  expect(box!.y, what).toBeGreaterThanOrEqual(-0.5);
  expect(box!.x + box!.width, what).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box!.y + box!.height, what).toBeLessThanOrEqual(viewport.height + 0.5);
  return box!;
};

const noRootOverflow = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);

/** Builds and prepares a plan from every seeded play, through the phone's own doors. */
async function preparePlanOnPhone(page: Page): Promise<number> {
  await page.goto("/");
  await expect(page.locator("header.topbar.phone-topbar")).toBeVisible();
  await chooseWorkspaceView(page, "Playbooks");
  await page
    .getByRole("navigation", { name: "Book pages" })
    .getByRole("button", { name: "Game plans", exact: true })
    .tap();
  const workspace = page.getByRole("region", { name: "Game plans" });
  await expect(workspace).toBeVisible();
  await workspace.getByRole("button", { name: "New plan" }).tap();
  await workspace.getByLabel("Plan name").fill(PLAN);
  await workspace.getByLabel("Opponent").fill("Central Catholic");
  await workspace
    .getByRole("textbox", { name: "Game", exact: true })
    .fill("Week 3, Homecoming");
  await workspace.getByRole("button", { name: "Create plan" }).tap();
  await expect(
    workspace.getByRole("button", { name: "Openers", exact: true }),
  ).toBeVisible();

  const boxes = workspace.getByRole("checkbox");
  const count = await boxes.count();
  expect(count).toBeGreaterThanOrEqual(2);
  for (let index = 0; index < count; index += 1) await boxes.nth(index).check();
  await workspace
    .getByRole("button", { name: new RegExp(`^Add ${count} to plan`) })
    .tap();
  const codes = workspace.getByLabel(/^Call number for/);
  await expect(codes).toHaveCount(count);
  for (let index = 0; index < count; index += 1) {
    await codes.nth(index).fill(String(10 + index));
    await codes.nth(index).press("Enter");
  }

  // A section with a name that will not fit beside anything.
  await workspace.getByRole("button", { name: "Openers", exact: true }).tap();
  const sectionName = workspace.getByLabel("Section name");
  await sectionName.fill(SECTION);
  await sectionName.press("Enter");
  await expect(
    workspace.getByRole("button", { name: SECTION, exact: true }),
  ).toBeVisible();

  await workspace.getByRole("button", { name: "Prepare for game" }).tap();
  await expect(workspace.getByText(/^Prepared/)).toBeVisible();
  return count;
}

/**
 * The diagram whole on the sideline (issue #163): an iPhone's visible area
 * upright, a taller phone, and a phone held sideways — where the diagram
 * shows only a sliver under the head if the head does not fold away.
 */
const SIDELINE = [
  { name: "390×664", width: 390, height: 664 },
  { name: "390×844", width: 390, height: 844 },
  { name: "844×390", width: 844, height: 390 },
];

/** Points across the box that something else answers for, if any. */
const coveredPoints = (target: Locator) =>
  target.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const covered: string[] = [];
    for (const fx of [0.01, 0.25, 0.5, 0.75, 0.99]) {
      for (const fy of [0.01, 0.25, 0.5, 0.75, 0.99]) {
        const x = box.left + box.width * fx;
        const y = box.top + box.height * fy;
        const hit = document.elementFromPoint(x, y);
        if (!hit || !node.contains(hit)) {
          const what = hit
            ? `${hit.tagName.toLowerCase()}.${String(hit.className)}`
            : "nothing";
          covered.push(`${Math.round(x)},${Math.round(y)} → ${what}`);
        }
      }
    }
    return covered;
  });

for (const viewport of SIDELINE) {
  test.describe(`Game Day's diagram at ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });

    test("shows the whole play, clear of every control, without scrolling", async ({
      page,
    }, testInfo) => {
      const count = await preparePlanOnPhone(page);
      await chooseWorkspaceView(page, "Game Day");
      const reader = page.getByRole("main", { name: "Game Day" });
      await reader
        .getByRole("button", { name: new RegExp(PLAN.slice(0, 20)) })
        .tap();

      // The header reads the plan; the editor's play, its history and its
      // Save wait in the editor.
      const banner = page.getByRole("banner");
      await expect(
        banner.getByRole("textbox", { name: "Play name" }),
      ).toHaveCount(0);
      await expect(
        banner.getByRole("button", { name: /^(Undo|Redo|Save)\b/ }),
      ).toHaveCount(0);
      const title = reader.locator(".reader-head .game-day-title");
      await expect(title).toContainText(PLAN);
      await inside(title, viewport);

      // Meta, search and the situation chips fold behind the one control.
      const picker = reader.getByRole("button", { name: /calls? — pick one/ });
      const search = reader.getByRole("searchbox", {
        name: "Find a call by number or name",
      });
      const situations = reader.getByRole("navigation", { name: "Situations" });
      await expect(search).toBeHidden();
      await expect(situations).toBeHidden();
      await inside(picker, viewport);
      await picker.tap();
      await expect(search).toBeVisible();
      await expect(situations).toBeVisible();
      await expect(
        reader.getByText(new RegExp(`Ready offline · ${count} calls`)),
      ).toBeVisible();
      await reader
        .getByRole("navigation", { name: "Calls" })
        .getByRole("button", { name: /^10 / })
        .tap();
      await expect(search).toBeHidden();

      const stage = reader.getByRole("region", { name: "Selected call" });
      await expect(stage.locator(".reader-code")).toHaveText("10");
      await inside(stage.locator(".reader-code"), viewport);

      // Nothing has scrolled, and the diagram — line to deepest back — is on
      // the glass with nothing drawn over any part of it.
      const svg = stage.locator("svg.field-diagram");
      await expect(svg).toBeVisible();
      const diagram = (await svg.boundingBox())!;
      expect(diagram.x).toBeGreaterThanOrEqual(-0.5);
      expect(diagram.y).toBeGreaterThanOrEqual(-0.5);
      expect(diagram.x + diagram.width).toBeLessThanOrEqual(
        viewport.width + 0.5,
      );
      expect(diagram.y + diagram.height).toBeLessThanOrEqual(
        viewport.height + 0.5,
      );
      expect(
        await page.evaluate(() => ({
          page: document.scrollingElement?.scrollTop ?? 0,
          stage:
            document.querySelector<HTMLElement>(".reader-stage")?.scrollTop ??
            0,
        })),
      ).toEqual({ page: 0, stage: 0 });
      expect(await coveredPoints(svg)).toEqual([]);

      // Previous / Next are whole and never over the diagram; held sideways
      // they stand beside it, one under each thumb, and the diagram has most
      // of the screen's height.
      const previous = await inside(
        reader.getByRole("button", { name: "Previous call" }),
        viewport,
      );
      const next = await inside(
        reader.getByRole("button", { name: "Next call" }),
        viewport,
      );
      const overlaps = (a: typeof diagram, b: typeof diagram) =>
        a.x < b.x + b.width - 0.5 &&
        b.x < a.x + a.width - 0.5 &&
        a.y < b.y + b.height - 0.5 &&
        b.y < a.y + a.height - 0.5;
      expect(overlaps(previous, diagram)).toBe(false);
      expect(overlaps(next, diagram)).toBe(false);
      if (viewport.width > viewport.height) {
        expect(previous.x + previous.width).toBeLessThanOrEqual(
          diagram.x + 0.5,
        );
        expect(next.x).toBeGreaterThanOrEqual(diagram.x + diagram.width - 0.5);
        expect(previous.y).toBeLessThan(diagram.y + diagram.height);
        expect(next.y).toBeLessThan(diagram.y + diagram.height);
        expect(diagram.height).toBeGreaterThan(viewport.height * 0.6);
      }
      await noRootOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`game-day-diagram-${viewport.name}.png`),
      });

      // Stepping keeps it whole.
      await reader.getByRole("button", { name: "Next call" }).tap();
      await expect(stage.locator(".reader-code")).toHaveText("11");
      expect(await coveredPoints(svg)).toEqual([]);
    });
  });
}

for (const viewport of VIEWPORTS) {
  test.describe(`Game Day on a phone at ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });

    test("keeps the call, its code and Previous / Next on the glass", async ({
      page,
    }, testInfo) => {
      const count = await preparePlanOnPhone(page);
      await chooseWorkspaceView(page, "Game Day");
      const reader = page.getByRole("main", { name: "Game Day" });
      await reader
        .getByRole("button", { name: new RegExp(PLAN.slice(0, 20)) })
        .tap();
      await noRootOverflow(page);

      // On a phone the calls fold behind one button, with the plan's meta,
      // the search and the situations (issue #163), and picking a call folds
      // them again. Upright, the section return has its own row under
      // Previous / Next; held sideways, they stand either side of the diagram.
      const upright = viewport.width < viewport.height;
      const picker = reader.getByRole("button", { name: /calls? — pick one/ });
      const hide = reader.getByRole("button", { name: /Hide the calls/ });
      const calls = reader.getByRole("navigation", { name: "Calls" });
      const situations = page.getByRole("navigation", { name: "Situations" });
      const openCalls = async () => {
        await picker.tap();
        await expect(calls).toBeVisible();
      };
      await inside(picker, viewport);
      await openCalls();
      await expect(
        reader.getByText(new RegExp(`Ready offline · ${count} calls`)),
      ).toBeVisible();
      await calls.getByRole("button", { name: /^10 / }).tap();
      await expect(calls).toBeHidden();

      const stage = reader.getByRole("region", { name: "Selected call" });
      await expect(stage.locator(".reader-code")).toHaveText("10");
      await inside(stage.locator(".reader-code"), viewport);
      await inside(stage.locator(".reader-name"), viewport);
      await inside(stage.getByText(SECTION, { exact: true }), viewport);
      await inside(stage.getByRole("button", { name: /favorites$/ }), viewport);

      // The diagram is whole inside the stage; upright it takes most of the
      // stage's width.
      const stageBox = await inside(stage, viewport);
      const diagram = await inside(
        stage.locator("svg.field-diagram"),
        viewport,
      );
      expect(diagram.x).toBeGreaterThanOrEqual(stageBox.x - 0.5);
      expect(diagram.x + diagram.width).toBeLessThanOrEqual(
        stageBox.x + stageBox.width + 0.5,
      );
      expect(diagram.y).toBeGreaterThanOrEqual(stageBox.y - 0.5);
      expect(diagram.y + diagram.height).toBeLessThanOrEqual(
        stageBox.y + stageBox.height + 0.5,
      );
      if (upright) {
        expect(diagram.width).toBeGreaterThan(stageBox.width * 0.85);
      }

      // Previous / Next are whole, 44 px tall and side by side.
      const previous = await inside(
        reader.getByRole("button", { name: "Previous call" }),
        viewport,
      );
      const next = await inside(
        reader.getByRole("button", { name: "Next call" }),
        viewport,
      );
      expect(Math.abs(previous.y - next.y)).toBeLessThan(4);
      expect(previous.height).toBeGreaterThanOrEqual(44);
      expect(next.height).toBeGreaterThanOrEqual(44);
      expect(next.x).toBeGreaterThanOrEqual(previous.x + previous.width);
      const back = await inside(reader.locator(".reader-back"), viewport);
      // Touch targets the first pass left out (issue #95): tabs, the star,
      // the way back to the plans, and the section return.
      expect(back.height).toBeGreaterThanOrEqual(40);
      const plansLink = await inside(
        reader.getByRole("button", { name: "Back to plans" }),
        viewport,
      );
      expect(plansLink.height).toBeGreaterThanOrEqual(44);
      expect(plansLink.width).toBeGreaterThanOrEqual(44);
      const star = await inside(
        stage.getByRole("button", { name: /favorites$/ }),
        viewport,
      );
      expect(star.height).toBeGreaterThanOrEqual(44);
      expect(star.width).toBeGreaterThanOrEqual(44);
      if (upright) {
        expect(back.y).toBeGreaterThanOrEqual(previous.y + previous.height - 1);
      }
      await page.screenshot({
        path: testInfo.outputPath("game-day-phone.png"),
      });
      await openCalls();
      const tab = await inside(
        situations.getByRole("button", { name: "★ Favorites" }),
        viewport,
      );
      expect(tab.height).toBeGreaterThanOrEqual(44);
      await hide.tap();

      await reader.getByRole("button", { name: "Next call" }).tap();
      await expect(stage.locator(".reader-code")).toHaveText("11");
      // The section return picks the section, folded away or not.
      const folded = page.getByRole("navigation", {
        name: "Situations",
        includeHidden: true,
      });
      await reader.locator(".reader-back").tap();
      await expect(
        folded.getByRole("button", {
          name: SECTION,
          exact: true,
          includeHidden: true,
        }),
      ).toHaveAttribute("aria-pressed", "true");
      await noRootOverflow(page);

      // Search and favorites work from the same fold, still without overflow.
      await reader.getByRole("button", { name: "Add to favorites" }).tap();
      await openCalls();
      await situations.getByRole("button", { name: "★ Favorites" }).tap();
      await expect(calls.getByRole("button", { name: /^\d+ / })).toHaveCount(1);
      const search = reader.getByRole("searchbox", {
        name: "Find a call by number or name",
      });
      const searchBox = await inside(search, viewport);
      if (upright)
        expect(searchBox.width).toBeGreaterThan(viewport.width * 0.6);
      await search.fill("11");
      await expect(calls.getByRole("button", { name: /^11 / })).toBeVisible();
      await noRootOverflow(page);
      await hide.tap();

      // Turning the phone keeps the call and the section.
      await page.setViewportSize({
        width: viewport.height,
        height: viewport.width,
      });
      await expect(stage.locator(".reader-code")).toHaveText("11");
      await expect(
        folded.getByRole("button", {
          name: "★ Favorites",
          includeHidden: true,
        }),
      ).toHaveAttribute("aria-pressed", "true");
      await inside(reader.getByRole("button", { name: "Next call" }), {
        width: viewport.height,
        height: viewport.width,
      });

      // And so does a reload.
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.reload();
      await expect(
        page
          .getByRole("region", { name: "Selected call" })
          .locator(".reader-code"),
      ).toHaveText("11");
    });
  });
}
