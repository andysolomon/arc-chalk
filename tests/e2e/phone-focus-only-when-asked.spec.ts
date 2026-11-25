import { type Page } from "@playwright/test";

import {
  chooseWorkspaceView,
  expect,
  openSeededEditor,
  test,
} from "./fixtures";

/**
 * On a phone, focus raises the keyboard over half the glass. Opening the
 * Formations browser, the Playbooks page or a filter leaves every text
 * field alone (#59, #87). A filter's sheet takes the focus itself, so a
 * screen reader lands in it. The open filter sheet is the artifact.
 */

/** The text field that holds the caret, by its accessible name, if one does. */
const focusedField = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    return active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement
      ? active.getAttribute("aria-label")
      : null;
  });

test("a phone opens browsers and filters without raising the keyboard", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);

  // The Formations browser, from the drawer's Formation row.
  await page.getByRole("button", { name: "Open the sidebar" }).click();
  await page
    .getByRole("navigation", { name: "Sidebar" })
    .locator('.sidebar-row-wrap[data-row="formation"] > .sidebar-row')
    .click();
  const formations = page.getByRole("dialog", { name: "Formations" });
  await expect(
    formations.getByRole("textbox", { name: "Search formations" }),
  ).toBeVisible();
  expect(await focusedField(page)).toBeNull();
  await formations.getByTitle("Close — esc").click();
  await expect(formations).toBeHidden();

  // The Playbooks page, and a filter on it.
  await chooseWorkspaceView(page, "Playbooks");
  await expect(
    page.getByRole("textbox", { name: "Search plays" }),
  ).toBeVisible();
  expect(await focusedField(page)).toBeNull();
  await page.locator(".chip-menu").first().click();
  const sheet = page.locator(".choice-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toBeFocused();
  expect(await focusedField(page)).toBeNull();
  await page.screenshot({
    path: testInfo.outputPath("phone-filter-sheet.png"),
  });
});
