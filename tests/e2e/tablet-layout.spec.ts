import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Issue #68: the shell chooses a docked inspector, a drawer or the reading
 * shell by the width it has; a finger's targets are real, non-overlapping
 * boxes; the library grid reflows; and search does not raise the keyboard.
 * Chromium with touch emulated stands in for iPad Safari here — WebKit and
 * a physical iPad are recorded on the pull request as run or not run.
 */
const VIEWPORTS = [
  ["iPad landscape 1366", { width: 1366, height: 1024 }],
  ["iPad landscape 1180", { width: 1180, height: 820 }],
  ["iPad landscape 1024", { width: 1024, height: 768 }],
  ["iPad portrait 834", { width: 834, height: 1194 }],
  ["Split View 694", { width: 694, height: 768 }],
  ["Split View 507", { width: 507, height: 768 }],
] as const;

const noHorizontalOverflow = async (page: Page) => {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
};

const box = async (locator: Locator) => {
  const rect = await locator.boundingBox();
  expect(rect, await locator.evaluate((node) => node.outerHTML)).not.toBeNull();
  return rect!;
};

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

for (const [label, viewport] of VIEWPORTS) {
  test.describe(label, () => {
    // The iPad descriptor's touch and mobile emulation, on Chromium.
    test.use({
      viewport,
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });

    test("keeps the destinations, the play and the selected call reachable", async ({
      page,
    }) => {
      await page.goto("/");
      expect(
        await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
      ).toBe(true);
      await noHorizontalOverflow(page);
      const nav = page.getByRole("navigation", { name: "Workspace views" });
      for (const name of ["Editor", "Playbooks", "Game Day"]) {
        const tab = nav.getByRole("button", { name, exact: true });
        await expect(tab).toBeVisible();
        const rect = await box(tab);
        expect(rect.height).toBeGreaterThanOrEqual(44);
        expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
      }
      await expect(
        page.getByRole("img", { name: "Stick — Thunder football play" }),
      ).toBeVisible();

      if (viewport.width < 668) {
        // Below the floor: reading, with the way in named.
        await expect(page.getByText("Read only")).toBeVisible();
        await expect(
          page.getByRole("navigation", { name: "Drawing tools" }),
        ).toHaveCount(0);
        await page.getByRole("button", { name: "Edit on this screen" }).click();
        await expect(
          page.getByRole("navigation", { name: "Drawing tools" }),
        ).toBeVisible();
        await noHorizontalOverflow(page);
        return;
      }

      const rail = page.getByRole("navigation", { name: "Drawing tools" });
      await expect(rail).toBeVisible();
      // Primary touch actions are at least 44 px and never share a box.
      const rects = [];
      for (const button of await rail.getByRole("button").all()) {
        const rect = await box(button);
        rects.push(rect);
        expect(rect.width).toBeGreaterThanOrEqual(44);
      }
      const tools = rects.slice(0, 7);
      for (const rect of tools) expect(rect.height).toBeGreaterThanOrEqual(44);
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          expect(overlaps(rects[i]!, rects[j]!), `${i} vs ${j}`).toBe(false);
        }
      }
      for (const name of ["Present", "Print & export", "Save"]) {
        const rect = await box(
          page.getByRole("banner").getByRole("button", { name, exact: true }),
        );
        expect(rect.height).toBeGreaterThanOrEqual(44);
        expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + 1);
      }

      const inspector = page.getByRole("complementary", {
        name: "Play inspector",
      });
      if (viewport.width >= 1024) {
        await expect(inspector).toBeVisible();
        const field = await box(page.locator("svg.field-diagram").first());
        const panel = await box(inspector);
        expect(overlaps(field, panel)).toBe(false);
      } else {
        // A drawer: closed to begin with, the stub brings it over the field.
        await expect(inspector).toHaveCount(0);
        const stub = page.getByRole("button", { name: "Inspector" });
        expect((await box(stub)).width).toBeGreaterThanOrEqual(44);
        await stub.click();
        await expect(inspector).toBeVisible();
        const panel = await box(inspector);
        expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width + 1);
        await expect(
          inspector.getByRole("button", { name: /^Library/ }),
        ).toBeVisible();
        await inspector
          .getByRole("button", { name: "Hide the inspector" })
          .click();
        await expect(inspector).toHaveCount(0);
      }
      await noHorizontalOverflow(page);
    });

    test("reflows the library without raising the keyboard", async ({
      page,
    }) => {
      await page.goto("/");
      await page
        .getByRole("navigation", { name: "Workspace views" })
        .getByRole("button", { name: "Playbooks", exact: true })
        .click();
      const search = page.getByRole("textbox", { name: "Search plays" });
      await expect(search).toBeVisible();
      await expect(search).not.toBeFocused();
      const scroller = page.locator(".playbook-scroll");
      const columns = Number(await scroller.getAttribute("data-grid-columns"));
      const width = (await box(scroller)).width;
      expect(columns).toBeGreaterThanOrEqual(1);
      expect(columns * 200).toBeLessThanOrEqual(width);
      // Every rendered row holds at most that many cards and no card is cut off.
      for (const row of await page.locator(".playbook-virtual-row").all()) {
        expect(await row.locator("[data-play-id]").count()).toBeLessThanOrEqual(
          columns,
        );
      }
      const cards = page.locator("[data-play-id]");
      const ids = await cards.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-play-id")),
      );
      expect(new Set(ids).size).toBe(ids.length);
      for (const card of await cards.all()) {
        const rect = await box(card);
        expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + 1);
      }
      await search.click();
      await expect(search).toBeFocused();
      await noHorizontalOverflow(page);
    });
  });
}
