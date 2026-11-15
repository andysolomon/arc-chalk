import type { Page } from "@playwright/test";

import { expect, openSeededEditor, test } from "./fixtures";

/**
 * Renaming a Play from the Playbooks page, without opening it first: a Play
 * of the book is renamed from its actions sheet, and the Play in the editor
 * from its card. The editor's name follows, Undo takes the rename back, and
 * a fresh tab finds the new names saved. The run ends with a screenshot of
 * the book's plays under their new names.
 */
test.use({ viewport: { width: 1280, height: 860 } });

const views = (page: Page) =>
  page.getByRole("navigation", { name: "Workspace views" });

const openBookPlays = async (page: Page) => {
  await views(page)
    .getByRole("button", { name: "Playbooks", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Playbooks pages" })
    .getByRole("button", { name: "Playbooks", exact: true })
    .click();
  if (!(await page.locator(".book-head").isVisible())) {
    await page
      .getByRole("region", { name: "Playbooks" })
      .locator(".shelf-card")
      .filter({ hasText: "Chalk Starter Playbook" })
      .locator(".shelf-open")
      .click();
  }
  await expect(page.locator(".book-head")).toBeVisible();
  await page
    .getByRole("group", { name: "Layout" })
    .getByRole("button", { name: "List" })
    .click();
};

const playNames = (page: Page) =>
  page.locator(".playbook-scroll [data-play-id] .playbook-text strong");

test("renames plays from the Playbooks page", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await openSeededEditor(page);
  await openBookPlays(page);
  await expect(playNames(page)).toHaveCount(8);

  // A Play not in the editor, renamed from its sheet.
  const names = await playNames(page).allTextContents();
  const other = names.find((name) => name !== "Stick — Thunder")!;
  await page
    .getByRole("button", { name: `Actions for ${other}`, exact: true })
    .click();
  const sheet = page.getByRole("dialog", { name: other, exact: true });
  await sheet.getByRole("button", { name: "Rename…", exact: true }).click();
  const field = sheet.getByRole("textbox", { name: "Play name" });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(other);
  // An empty name is not saved.
  await field.fill("   ");
  await expect(sheet.getByRole("button", { name: "Save" })).toBeDisabled();
  await field.fill("Trips Right — Y Corner");
  await field.press("Enter");
  await expect(sheet).toBeHidden();
  await expect(playNames(page)).toContainText(["Trips Right — Y Corner"]);
  await expect(playNames(page)).not.toContainText([other]);

  // The Play in the editor, renamed from its card.
  await page
    .locator(".playbook-scroll [data-play-id]")
    .filter({
      has: page.getByText("Stick — Thunder", { exact: true }),
    })
    .locator(".playbook-open")
    .click();
  const card = page.getByRole("dialog", {
    name: "Stick — Thunder",
    exact: true,
  });
  await card
    .getByRole("button", { name: "Rename Stick — Thunder", exact: true })
    .click();
  const cardField = card.getByRole("textbox", { name: "Play name" });
  await expect(cardField).toBeFocused();
  // The arrows move the caret here, not the card to another Play.
  await cardField.press("ArrowLeft");
  await expect(card).toBeVisible();
  await cardField.fill("Stick — Lightning");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  const renamed = page.getByRole("dialog", {
    name: "Stick — Lightning",
    exact: true,
  });
  await expect(renamed.locator(".play-card-name strong")).toHaveText(
    "Stick — Lightning",
  );
  await renamed.getByRole("button", { name: "Back to the editor" }).click();

  // The editor reads the new name, and Undo takes it back.
  const editorName = page
    .getByRole("banner")
    .getByRole("textbox", { name: "Play name" });
  await expect(editorName).toHaveValue("Stick — Lightning");
  await page.keyboard.press("Control+z");
  await expect(editorName).toHaveValue("Stick — Thunder");
  await page.keyboard.press("Control+Shift+z");
  await expect(editorName).toHaveValue("Stick — Lightning");
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();

  // Saved on this device: a new tab finds both names.
  const context = page.context();
  await page.close();
  const again = await context.newPage();
  await again.goto("/");
  await expect(
    again.getByRole("banner").getByRole("textbox", { name: "Play name" }),
  ).toHaveValue("Stick — Lightning", { timeout: 30_000 });
  await openBookPlays(again);
  await expect(playNames(again)).toContainText([
    "Stick — Lightning",
    "Trips Right — Y Corner",
  ]);
  await again.locator(".playbook-scroll").hover({ position: { x: 1, y: 1 } });
  await again.screenshot({
    path: testInfo.outputPath("play-rename-book.png"),
    fullPage: true,
  });
});
