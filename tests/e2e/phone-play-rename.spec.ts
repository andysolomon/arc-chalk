import type { Locator, Page } from "@playwright/test";

import {
  chooseWorkspaceView,
  expect,
  openSeededEditor,
  test,
} from "./fixtures";

/**
 * Renaming a Play from the Playbooks page on a phone: the Play's sheet rises
 * from the bottom with Rename…, the name field fits the sheet, and the list
 * reads the new name. The run ends with a screenshot of the renamed list.
 */
const VIEWPORTS = [
  { name: "360×800", width: 360, height: 800 },
  { name: "390×844", width: 390, height: 844 },
];

const box = async (locator: Locator) => {
  const rect = await locator.boundingBox();
  expect(rect, await locator.evaluate((node) => node.outerHTML)).not.toBeNull();
  return rect!;
};

const playNames = (page: Page) =>
  page.locator(".playbook-scroll [data-play-id] .playbook-text strong");

for (const viewport of VIEWPORTS) {
  test.describe(`phone play rename at ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });

    test("renames a play from its sheet", async ({ page }, testInfo) => {
      await openSeededEditor(page);
      await chooseWorkspaceView(page, "Playbooks");
      await expect(page.locator(".book-head")).toBeVisible();
      await expect(playNames(page)).toHaveCount(8);

      const names = await playNames(page).allTextContents();
      const other = names.find((name) => name !== "Stick — Thunder")!;
      await page
        .getByRole("button", { name: `Actions for ${other}`, exact: true })
        .tap();
      const sheet = page.getByRole("dialog", { name: other, exact: true });
      const rename = sheet.getByRole("button", {
        name: "Rename…",
        exact: true,
      });
      expect((await box(rename)).height).toBeGreaterThanOrEqual(44);
      await rename.tap();

      const field = sheet.getByRole("textbox", { name: "Play name" });
      await expect(field).toHaveValue(other);
      const sheetBox = await box(sheet);
      const fieldBox = await box(field);
      expect(fieldBox.x).toBeGreaterThanOrEqual(sheetBox.x);
      expect(fieldBox.x + fieldBox.width).toBeLessThanOrEqual(
        sheetBox.x + sheetBox.width,
      );
      await field.fill("Bunch Left — Snag");
      await sheet.getByRole("button", { name: "Save", exact: true }).tap();
      await expect(sheet).toBeHidden();
      await expect(playNames(page)).toContainText(["Bunch Left — Snag"]);
      await expect(playNames(page)).not.toContainText([other]);

      await page.screenshot({
        path: testInfo.outputPath("phone-play-rename.png"),
        fullPage: false,
      });
    });
  });
}
