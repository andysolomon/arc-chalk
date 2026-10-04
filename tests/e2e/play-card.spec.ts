import type { Page } from "@playwright/test";

import { expect, openSeededEditor, test } from "./fixtures";

/**
 * A Play selected in the open book opens its card over the page rather than
 * the editor: the Play drawn large, what it is, a walk through the book, and
 * Open in editor one press away. The cards on the page are wide enough to
 * read. The test ends with a screenshot of a Play's card.
 */

const openBook = async (page: Page) => {
  await openSeededEditor(page);
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Playbooks", exact: true })
    .click();
  await expect(page.locator(".book-title strong")).toHaveText(
    "Chalk Starter Playbook",
  );
};

const play = (page: Page, name: string) =>
  page.locator(".playbook-scroll [data-play-id]", { hasText: name });

test("reads a play on its card and opens it in the editor from there", async ({
  page,
}, testInfo) => {
  await openBook(page);
  const scroller = page.locator(".playbook-scroll");
  await expect(scroller).toHaveAttribute("data-layout", "grid");

  // Four across a desk, each card's art at the sheet's own proportions.
  await expect(scroller).toHaveAttribute("data-grid-columns", "4");
  const card = play(page, "Four Verticals");
  const art = await card.locator(".playbook-thumb").boundingBox();
  expect(art!.width).toBeGreaterThanOrEqual(300);
  expect(art!.height).toBeGreaterThanOrEqual(170);

  // Selecting a Play opens its card; the editor stays where it was.
  await page.getByRole("combobox", { name: "Sort plays" }).selectOption("name");
  await card.locator(".playbook-open").click();
  const dialog = page.getByRole("dialog", { name: "Four Verticals" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".playbook-card-type")).toContainText("Offense");
  const field = dialog.getByRole("img", {
    name: "Four Verticals football play",
  });
  await expect(field).toBeVisible();
  await expect(field.locator("[data-scene-player]")).not.toHaveCount(0);
  await expect(field.locator("[data-scene-path]")).not.toHaveCount(0);
  const drawn = await field.boundingBox();
  expect(drawn!.width).toBeGreaterThanOrEqual(600);

  // The arrows walk the Plays the page shows, in its order.
  const names = await page
    .locator(".playbook-scroll [data-play-id] .playbook-text strong")
    .allTextContents();
  const at = names.indexOf("Four Verticals");
  await expect(dialog.locator(".play-card-place")).toHaveText(
    `${at + 1} of ${names.length}`,
  );
  await page.keyboard.press("ArrowRight");
  const next = page.getByRole("dialog", { name: names[at + 1] });
  await expect(next).toBeVisible();
  await next.getByRole("button", { name: "Previous play" }).click();
  await expect(dialog).toBeVisible();

  // Escape closes the card and leaves the Coach on the page.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator(".book-title strong")).toBeVisible();

  // More… is the Play's sheet: copy, move, delete.
  await card.locator(".playbook-open").click();
  await dialog.getByRole("button", { name: "More…" }).click();
  const sheet = page.getByRole("dialog", { name: "Four Verticals" });
  await expect(sheet.getByRole("button", { name: "Delete…" })).toBeVisible();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();

  // Open in editor puts the Play on the field.
  await card.locator(".playbook-open").click();
  await expect(dialog).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("play-card.png"),
  });
  await dialog.getByRole("button", { name: "Open in editor" }).click();
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Four Verticals",
  );
});
