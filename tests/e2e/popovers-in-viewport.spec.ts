import type { Locator, Page } from "@playwright/test";

import { expect, openSeededEditor, openViewAndLibrary, test } from "./fixtures";

/**
 * No popover runs off the window. A row's popover hangs from the top of its
 * row, so on a short window the Library — low in the folded rail, or low in
 * the open sidebar once View & library is unfolded — ran past the bottom of
 * the glass with its plays out of reach. Every floating panel is now nudged
 * back inside the window, and one taller than the window scrolls inside
 * itself. The test ends on a screenshot of the folded rail's Library on a
 * short 1280×560 window, dark.
 */
test.use({ viewport: { width: 1280, height: 560 }, colorScheme: "dark" });

test.skip(
  ({ viewport }) => (viewport?.width ?? 0) < 1180,
  "a docked sidebar needs a desktop's width",
);

const folded = (page: Page) =>
  page.getByRole("navigation", { name: "Folded sidebar" });

/** Asserts the whole of a panel lies inside the window. */
async function expectInsideWindow(page: Page, panel: Locator) {
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  if (!box) throw new Error("no box");
  const { width, height } = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
  expect(box.y + box.height).toBeLessThanOrEqual(height);
}

test("a sidebar popover low on a short window stays inside it", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);

  // The open sidebar: the Library sits low once View & library unfolds.
  await openViewAndLibrary(page);
  await page.locator('[data-row="library"] > button.sidebar-row').click();
  const library = page.locator(".sidebar-row-wrap .sidebar-popover");
  await expectInsideWindow(page, library);
  await page.locator('[data-row="library"] > button.sidebar-row').click();
  await expect(library).toHaveCount(0);

  // The folded rail: its Library icon is near the foot.
  await page
    .getByRole("navigation", { name: "Sidebar", exact: true })
    .getByRole("button", { name: "Hide the sidebar" })
    .click();
  await expect(folded(page)).toBeVisible();
  for (const name of [/^Library/, "Help"]) {
    const icon = folded(page).getByRole("button", { name });
    await icon.click();
    await expectInsideWindow(
      page,
      folded(page).locator(".sidebar-rail-item .sidebar-popover"),
    );
    await icon.click();
  }

  // The plays at the end of the Library can still be reached.
  await folded(page)
    .getByRole("button", { name: /^Library/ })
    .click();
  const railLibrary = folded(page).getByRole("group", { name: "Library" });
  await expectInsideWindow(page, railLibrary);
  await railLibrary.evaluate((node) => {
    node.scrollTop = 0;
  });

  await page.screenshot({
    path: testInfo.outputPath("rail-library-in-window.png"),
  });
});

test("Share & assets, opened from More on a short window, stays inside it", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Share & assets" }).click();
  const share = page.locator(".share-assets-panel");
  await expectInsideWindow(page, share);
  await page.screenshot({
    path: testInfo.outputPath("share-assets-in-window.png"),
  });
});
