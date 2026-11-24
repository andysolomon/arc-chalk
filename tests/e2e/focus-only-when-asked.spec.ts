import { type Page } from "@playwright/test";

import {
  chooseWorkspaceView,
  expect,
  openSeededEditor,
  test,
} from "./fixtures";

/**
 * Focus raises a tablet's keyboard, so opening a panel leaves its search
 * alone (#59, #87), and a field takes the caret only when the Coach's own
 * press or key asked to type into it. This runs with a mouse, where search
 * used to take focus as a browser opened. The Defenses browser, still open
 * and unfocused, is the artifact.
 */

test.use({ viewport: { width: 1440, height: 960 } });

/** The text field that holds the caret, by its accessible name, if one does. */
const focusedField = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    return active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement
      ? active.getAttribute("aria-label")
      : null;
  });

test("opening a panel leaves its search alone", async ({ page }, testInfo) => {
  await openSeededEditor(page);

  // The Concept picker, from the inspector's play call (#87).
  await page.locator(".play-call .preset-summary").first().click();
  const picker = page.locator(".preset-picker");
  await expect(picker.getByRole("textbox").first()).toBeVisible();
  expect(await focusedField(page)).toBeNull();
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);

  // The Formations browser (#59).
  await page.keyboard.press("Control+Shift+f");
  const formations = page.getByRole("dialog", { name: "Formations" });
  await expect(
    formations.getByRole("textbox", { name: "Search formations" }),
  ).toBeVisible();
  expect(await focusedField(page)).toBeNull();
  await formations.getByTitle("Close — esc").click();
  await expect(formations).toBeHidden();

  // The Playbooks page.
  await chooseWorkspaceView(page, "Playbooks");
  await expect(
    page.getByRole("textbox", { name: "Search plays" }),
  ).toBeVisible();
  expect(await focusedField(page)).toBeNull();
  await chooseWorkspaceView(page, "Editor");

  // The Defenses browser.
  await page.keyboard.press("Control+Shift+d");
  const defenses = page.getByRole("dialog", { name: "Defenses" });
  const search = defenses.getByRole("textbox", { name: "Search defenses" });
  await expect(search).toBeVisible();
  expect(await focusedField(page)).toBeNull();
  await defenses.screenshot({
    path: testInfo.outputPath("defenses-search-unfocused.png"),
  });
});

test("a key or a press that asks to type puts the caret in the field", async ({
  page,
}) => {
  await openSeededEditor(page);

  // The command palette, from its key.
  await page.keyboard.press("Control+k");
  await expect(
    page
      .getByRole("dialog", { name: "Command palette" })
      .getByRole("textbox", { name: "Command palette" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");

  // A playbook's new name, from Rename on the open book.
  await chooseWorkspaceView(page, "Playbooks");
  await page
    .getByRole("button", { name: "Rename Chalk Starter Playbook" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Playbook name" }),
  ).toBeFocused();
});
