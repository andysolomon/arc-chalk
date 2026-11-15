import { type Page } from "@playwright/test";

import { expect, openBlankEditor, test } from "./fixtures";

/**
 * A popover the left sidebar opens goes away on a press anywhere past it:
 * the field, the tools at the column's head, the header, or another part of
 * the sidebar itself. A press inside it keeps it, and its own row still
 * toggles it. The sidebar after the last dismissal is the artifact.
 */

const sidebar = (page: Page) =>
  page.getByRole("navigation", { name: "Sidebar" });
const popover = (page: Page) => page.locator(".sidebar-popover");
const row = (page: Page, id: string) =>
  sidebar(page).locator(`.sidebar-row-wrap[data-row="${id}"] > .sidebar-row`);

test.skip(
  ({ viewport }) => (viewport?.width ?? 0) < 1180,
  "a docked sidebar's popovers need a desktop's width",
);

test("a sidebar popover closes on a press anywhere outside it", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await openBlankEditor(page);

  // The field.
  await row(page, "shadow").click();
  await expect(popover(page)).toBeVisible();
  const field = page.locator(".editor-stage");
  const stage = await field.boundingBox();
  if (!stage) throw new Error("no stage");
  await page.mouse.click(
    stage.x + stage.width - 40,
    stage.y + stage.height - 40,
  );
  await expect(popover(page)).toHaveCount(0);

  // A press inside keeps it; its own row still closes it.
  await row(page, "shadow").click();
  await expect(popover(page)).toBeVisible();
  await popover(page).click({ position: { x: 8, y: 8 } });
  await expect(popover(page)).toBeVisible();
  await row(page, "shadow").click();
  await expect(popover(page)).toHaveCount(0);

  // The sidebar's own empty space, below its rows.
  await row(page, "ball").click();
  await expect(popover(page)).toBeVisible();
  const nav = await sidebar(page).boundingBox();
  if (!nav) throw new Error("no sidebar");
  await page.mouse.click(nav.x + nav.width / 2, nav.y + nav.height - 120);
  await expect(popover(page)).toHaveCount(0);

  // The sidebar's headings.
  const fold = sidebar(page).getByRole("button", { name: "View & library" });
  if ((await fold.getAttribute("aria-expanded")) !== "true") {
    await fold.click();
  }
  await row(page, "library").click();
  await expect(popover(page)).toBeVisible();
  await sidebar(page).locator(".sidebar-heading").first().click();
  await expect(popover(page)).toHaveCount(0);

  // The tools heading the column.
  await row(page, "library").click();
  await expect(popover(page)).toBeVisible();
  await page
    .locator(".sidebar-tools-group .sidebar-heading")
    .click({ force: true });
  await expect(popover(page)).toHaveCount(0);

  // Another row swaps one popover for the other.
  await row(page, "library").click();
  await expect(popover(page)).toBeVisible();
  await row(page, "shadow").click();
  await expect(popover(page)).toHaveCount(1);
  await expect(row(page, "shadow")).toHaveAttribute("aria-expanded", "true");
  await expect(row(page, "library")).toHaveAttribute("aria-expanded", "false");

  // The header.
  await page
    .locator("header")
    .first()
    .click({ position: { x: 700, y: 10 } });
  await expect(popover(page)).toHaveCount(0);

  await page
    .locator(".sidebar-column")
    .screenshot({ path: testInfo.outputPath("sidebar-dismissed.png") });
});
