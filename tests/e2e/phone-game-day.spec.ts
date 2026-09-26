import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

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
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Playbooks", exact: true })
    .tap();
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
      await page
        .getByRole("navigation", { name: "Workspace views" })
        .getByRole("button", { name: "Game Day", exact: true })
        .tap();
      const reader = page.getByRole("main", { name: "Game Day" });
      await reader
        .getByRole("button", { name: new RegExp(PLAN.slice(0, 20)) })
        .tap();
      await expect(
        reader.getByText(new RegExp(`Ready offline · ${count} calls`)),
      ).toBeVisible();
      await noRootOverflow(page);

      // Below 768 px the calls fold behind one button and picking one folds
      // them again; a phone held sideways keeps the list beside the call.
      const folds = viewport.width <= 767;
      const picker = reader.getByRole("button", { name: /calls? — pick one/ });
      const calls = reader.getByRole("navigation", { name: "Calls" });
      const openCalls = async () => {
        if (folds) await picker.tap();
        await expect(calls).toBeVisible();
      };
      if (folds) await inside(picker, viewport);
      await openCalls();
      await calls.getByRole("button", { name: /^10 / }).tap();
      if (folds) await expect(calls).toBeHidden();

      const stage = reader.getByRole("region", { name: "Selected call" });
      await expect(stage.locator(".reader-code")).toHaveText("10");
      await inside(stage.locator(".reader-code"), viewport);
      await inside(stage.locator(".reader-name"), viewport);
      await inside(stage.getByText(SECTION, { exact: true }), viewport);
      await inside(stage.getByRole("button", { name: /favorites$/ }), viewport);

      // The diagram is a useful size — most of the stage's width — and the
      // stage scrolls to any part of it a shallow screen cannot show at once.
      const stageBox = await inside(stage, viewport);
      const svg = stage.locator("svg.field-diagram");
      await svg.scrollIntoViewIfNeeded();
      const diagram = (await svg.boundingBox())!;
      expect(diagram.x).toBeGreaterThanOrEqual(stageBox.x - 0.5);
      expect(diagram.x + diagram.width).toBeLessThanOrEqual(
        stageBox.x + stageBox.width + 0.5,
      );
      expect(diagram.width).toBeGreaterThan(stageBox.width * 0.85);
      expect(diagram.y).toBeGreaterThanOrEqual(stageBox.y - 0.5);
      await svg.evaluate((node) =>
        node.scrollIntoView({ block: "end", inline: "nearest" }),
      );
      const bottom = (await svg.boundingBox())!;
      expect(bottom.y + bottom.height).toBeLessThanOrEqual(
        stageBox.y + stageBox.height + 0.5,
      );

      // Previous / Next are whole, 44 px tall and side by side; on a phone
      // the section return has its own row below them.
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
      const tab = await inside(
        page
          .getByRole("navigation", { name: "Situations" })
          .getByRole("button", { name: "★ Favorites" }),
        viewport,
      );
      expect(tab.height).toBeGreaterThanOrEqual(44);
      if (folds) {
        expect(back.y).toBeGreaterThanOrEqual(previous.y + previous.height - 1);
      }
      await page.screenshot({
        path: testInfo.outputPath("game-day-phone.png"),
      });

      await reader.getByRole("button", { name: "Next call" }).tap();
      await expect(stage.locator(".reader-code")).toHaveText("11");
      await reader.locator(".reader-back").tap();
      await expect(
        page
          .getByRole("navigation", { name: "Situations" })
          .getByRole("button", { name: SECTION, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await noRootOverflow(page);

      // Search and favorites work from the same head, still without overflow.
      await reader.getByRole("button", { name: "Add to favorites" }).tap();
      await page
        .getByRole("navigation", { name: "Situations" })
        .getByRole("button", { name: "★ Favorites" })
        .tap();
      await openCalls();
      await expect(calls.getByRole("button", { name: /^\d+ / })).toHaveCount(1);
      if (folds)
        await reader.getByRole("button", { name: /Hide the calls/ }).tap();
      const search = reader.getByRole("searchbox", {
        name: "Find a call by number or name",
      });
      const searchBox = await inside(search, viewport);
      if (folds) expect(searchBox.width).toBeGreaterThan(viewport.width * 0.6);
      await search.fill("11");
      await openCalls();
      await expect(calls.getByRole("button", { name: /^11 / })).toBeVisible();
      await noRootOverflow(page);

      // Turning the phone keeps the call and the section.
      await page.setViewportSize({
        width: viewport.height,
        height: viewport.width,
      });
      await expect(stage.locator(".reader-code")).toHaveText("11");
      await expect(
        page
          .getByRole("navigation", { name: "Situations" })
          .getByRole("button", { name: "★ Favorites" }),
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
