import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * The editor on a phone (issues #98 and #99): the status bar's controls stay
 * on the glass, and "Fit the field" fits the field to the stage it is in —
 * in both directions, because a phone held sideways is wide and shallow.
 */
const VIEWPORTS = [
  { name: "360×800", width: 360, height: 800 },
  { name: "375×667", width: 375, height: 667 },
  { name: "390×844", width: 390, height: 844 },
  { name: "430×932", width: 430, height: 932 },
  { name: "844×390", width: 844, height: 390 },
  { name: "926×428", width: 926, height: 428 },
];

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Where the drawing actually is on the glass, not where its element box is. */
const renderedFieldRect = (page: Page) =>
  page.evaluate((): Rect => {
    const svg = document.querySelector("svg.field-diagram");
    if (!svg) throw new Error("No field on screen.");
    let union: Rect | undefined;
    for (const node of svg.querySelectorAll("*")) {
      if (node.closest("defs")) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      union = union
        ? {
            left: Math.min(union.left, rect.left),
            top: Math.min(union.top, rect.top),
            right: Math.max(union.right, rect.right),
            bottom: Math.max(union.bottom, rect.bottom),
          }
        : {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          };
    }
    if (!union) throw new Error("The field drew nothing.");
    return union;
  });

const stageRect = (page: Page) =>
  page.evaluate((): Rect => {
    const stage = document.querySelector(".field-wrap");
    if (!stage) throw new Error("No stage on screen.");
    const rect = stage.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    };
  });

const enterEditor = async (page: Page) => {
  await page.goto("/");
  await expect(
    page
      .getByRole("textbox", { name: "Play name" })
      .or(page.getByText("Read only")),
  ).toBeVisible({ timeout: 30_000 });
  const edit = page.getByRole("button", { name: "Edit on this screen" });
  if (await edit.isVisible()) await edit.click();
  await expect(
    page.getByRole("navigation", { name: "Drawing tools" }),
  ).toBeVisible();
};

for (const viewport of VIEWPORTS) {
  test.describe(`phone editor at ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });

    test("keeps every status control on the glass and zoom under a finger", async ({
      page,
    }) => {
      await enterEditor(page);
      const controls = page.locator(".status-controls > *:visible");
      const count = await controls.count();
      expect(count).toBeGreaterThan(0);
      for (let index = 0; index < count; index += 1) {
        const control = controls.nth(index);
        const box = await control.boundingBox();
        expect(
          box,
          await control.evaluate((node) => node.outerHTML),
        ).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      }

      // The one report of a failed write stays in view at every width.
      await expect(
        page.getByRole("button", { name: "Saved on this device" }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Zoom in" }).tap();
      await expect(
        page.getByRole("button", { name: "Fit the field — 125% zoom" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Fit the field — 125% zoom" })
        .tap();
      await expect(
        page.getByRole("button", { name: "Fit the field — 100% zoom" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Zoom out" }).tap();
      await expect(
        page.getByRole("button", { name: "Fit the field — 80% zoom" }),
      ).toBeVisible();
    });

    test("fits the whole field inside the stage", async ({ page }) => {
      await enterEditor(page);
      await page.getByRole("button", { name: "Inspector" }).click();
      await expect(
        page.getByRole("complementary", { name: "Play inspector" }),
      ).toBeVisible();
      await page.getByTitle("Browse formations — ⇧⌘F").click();
      await page
        .getByRole("dialog", { name: "Formations" })
        .getByText("Gun Doubles Right", { exact: true })
        .click();
      await expect(page.locator("[data-scene-player]")).toHaveCount(11);
      await page.getByRole("button", { name: "Hide the inspector" }).click();
      await expect(
        page.getByRole("complementary", { name: "Play inspector" }),
      ).toHaveCount(0);

      await page.getByRole("button", { name: "Zoom in" }).tap();
      await page
        .getByRole("button", { name: "Fit the field — 125% zoom" })
        .tap();
      await expect(
        page.getByRole("button", { name: "Fit the field — 100% zoom" }),
      ).toBeVisible();

      const stage = await stageRect(page);
      const field = await renderedFieldRect(page);
      const slack = 1;
      expect(field.left).toBeGreaterThanOrEqual(stage.left - slack);
      expect(field.top).toBeGreaterThanOrEqual(stage.top - slack);
      expect(field.right).toBeLessThanOrEqual(stage.right + slack);
      expect(field.bottom).toBeLessThanOrEqual(stage.bottom + slack);

      // Fit is a fit, not a sliver: the drawing fills one axis of the stage.
      const stageWidth = stage.right - stage.left;
      const stageHeight = stage.bottom - stage.top;
      const fieldWidth = field.right - field.left;
      const fieldHeight = field.bottom - field.top;
      expect(
        Math.max(fieldWidth / stageWidth, fieldHeight / stageHeight),
      ).toBeGreaterThan(0.85);

      // Both halves of the field are on the glass: a man above the line of
      // scrimmage and a man below it.
      const players = page.locator("[data-scene-player]");
      const boxes = await players.evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().top),
      );
      expect(Math.min(...boxes)).toBeGreaterThanOrEqual(stage.top - slack);
      expect(Math.max(...boxes)).toBeLessThanOrEqual(stage.bottom + slack);
    });
  });
}
