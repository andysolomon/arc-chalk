import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * The drawing tools stand in a row across the top of the field on a desktop
 * or a tablet, between the sidebar and the inspector, rather than in a column
 * down its left edge. A phone keeps them along the bottom of the glass, where
 * the thumb is (ADR 0055).
 */

const box = async (locator: Locator) => {
  const rect = await locator.boundingBox();
  expect(rect, await locator.evaluate((node) => node.outerHTML)).not.toBeNull();
  return rect!;
};

const tools = (page: Page) =>
  page.getByRole("navigation", { name: "Drawing tools" });
const field = (page: Page) => page.locator(".field-wrap");

const expectBarAcrossTheTop = async (page: Page) => {
  const bar = await box(tools(page));
  const stage = await box(page.locator("main.editor-stage"));
  const wrap = await box(field(page));
  // A row, not a column: as wide as the field's column, and short.
  expect(bar.width).toBeGreaterThan(bar.height * 4);
  expect(Math.abs(bar.x - stage.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(bar.width - stage.width)).toBeLessThanOrEqual(1);
  // Above the field, at the top of its column.
  expect(Math.abs(bar.y - stage.y)).toBeLessThanOrEqual(1);
  expect(bar.y + bar.height).toBeLessThanOrEqual(wrap.y + 1);
  // Every tool on the one row.
  const rows = new Set<number>();
  for (const button of await tools(page).getByRole("button").all()) {
    const rect = await box(button);
    rows.add(Math.round(rect.y + rect.height / 2));
  }
  expect(rows.size).toBe(1);
};

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test("puts the tools across the top of the field, and folds them up there", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await expect(
      page.getByRole("img", { name: "Stick — Thunder football play" }),
    ).toBeVisible();
    await expectBarAcrossTheTop(page);

    // Text at the start of the row; Trash and the fold at its end.
    const bar = await box(tools(page));
    const text = await box(tools(page).getByRole("button").first());
    const fold = await box(
      tools(page).getByRole("button", { name: "Hide the tools" }),
    );
    expect(text.x).toBeLessThan(bar.x + bar.width / 4);
    expect(fold.x + fold.width).toBeGreaterThan(bar.x + (bar.width * 3) / 4);

    await tools(page).getByRole("button", { name: "Hide the tools" }).click();
    await expect(tools(page)).toHaveCount(0);
    const stub = page.getByRole("button", { name: "Tools", exact: true });
    const stubBox = await box(stub);
    const wrap = await box(field(page));
    expect(stubBox.width).toBeGreaterThan(stubBox.height * 4);
    expect(stubBox.y + stubBox.height).toBeLessThanOrEqual(wrap.y + 1);

    await stub.click();
    await expectBarAcrossTheTop(page);
    await page.screenshot({
      path: testInfo.outputPath("tool-bar-desktop.png"),
    });
  });
});

test.describe("tablet", () => {
  test.use({
    viewport: { width: 834, height: 1194 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });

  test("keeps the row's end clear of the inspector's floating stub", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await expect(page.locator(".chalk-shell.phone-workspace")).toHaveCount(0);
    await expectBarAcrossTheTop(page);

    // Below 1024 the inspector's stub floats over the field's right edge;
    // the fold and Trash stay out from under it, and a finger reaches them.
    const inspectorStub = await box(page.locator(".inspector-stub"));
    for (const name of ["Delete selection — ⌫", "Hide the tools"]) {
      const rect = await box(tools(page).getByRole("button", { name }));
      expect(rect.x + rect.width).toBeLessThanOrEqual(inspectorStub.x);
      expect(rect.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({
      path: testInfo.outputPath("tool-bar-tablet.png"),
    });
    await tools(page).getByRole("button", { name: "Hide the tools" }).tap();
    await expect(tools(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Tools", exact: true }).tap();
    await expectBarAcrossTheTop(page);
  });
});

test.describe("phone width", () => {
  test.use({
    viewport: { width: 507, height: 768 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });

  test("leaves a phone's tools along the bottom", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".chalk-shell.phone-workspace")).toBeVisible();
    const bar = await box(tools(page));
    const wrap = await box(field(page));
    expect(bar.y).toBeGreaterThanOrEqual(wrap.y + wrap.height - 1);
  });
});
