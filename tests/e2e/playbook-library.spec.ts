import type { Locator, Page } from "@playwright/test";

import { expect, openSeededEditor, test } from "./fixtures";

/**
 * Organizing a real library (issue #166), the way a Coach reorganizes over a
 * season: a new defensive book starts empty and asks which side its first
 * Play is for; a front built on the field is saved under Mine in the
 * Defenses book and put on the next Play in one pick; Plays are copied and
 * moved between books with their Concept; a book's Plays are put in install
 * order, which its full-playbook export reads in; and the shelf renames,
 * duplicates, archives, deletes and sorts books, with every card counting
 * its offense and defense. The test ends with a screenshot of the shelf.
 */

const views = (page: Page) =>
  page.getByRole("navigation", { name: "Workspace views" });

const openShelf = async (page: Page) => {
  await views(page)
    .getByRole("button", { name: "Playbooks", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Playbooks pages" })
    .getByRole("button", { name: "Playbooks", exact: true })
    .click();
  const back = page.getByRole("button", { name: /Playbooks$/ }).last();
  if (await page.locator(".book-head").isVisible()) await back.click();
  const shelf = page.getByRole("region", { name: "Playbooks" });
  await expect(shelf.locator(".shelf-grid").first()).toBeVisible();
  return shelf;
};

const card = (shelf: Locator, name: string) =>
  shelf.locator(".shelf-card").filter({
    has: shelf.page().getByText(name, { exact: true }),
  });

const shelfAction = async (shelf: Locator, book: string, action: string) => {
  await shelf
    .getByRole("button", { name: `Actions for ${book}`, exact: true })
    .click();
  const sheet = shelf.page().getByRole("dialog", { name: book, exact: true });
  await sheet.getByRole("button", { name: action, exact: true }).click();
  return sheet;
};

const playNames = (page: Page) =>
  page.locator(".playbook-scroll [data-play-id] .playbook-text strong");

const playAction = async (page: Page, play: string, action: string) => {
  await page
    .getByRole("button", { name: `Actions for ${play}`, exact: true })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: play, exact: true });
  await sheet.getByRole("button", { name: action, exact: true }).click();
  return sheet;
};

/**
 * Steps a Play once in the install order from its sheet, then closes the
 * sheet with its own Cancel: WebKit does not focus a tapped button, so an
 * Escape would reach the page and leave it for the editor.
 */
const closeSheet = async (page: Page, play: string) => {
  const sheet = await playAction(page, play, "Move earlier");
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();
};

const toEditor = (page: Page) =>
  views(page).getByRole("button", { name: "Editor", exact: true }).click();

/**
 * Chalk opened again on this device, in a new tab: the fixture's page wipes
 * the device each time it loads, so a reload would start over.
 */
const reopen = async (page: Page): Promise<Page> => {
  const context = page.context();
  const size = page.viewportSize();
  await page.close();
  const again = await context.newPage();
  if (size) await again.setViewportSize(size);
  await again.goto("/");
  await expect(again.getByRole("textbox", { name: "Play name" })).toBeVisible({
    timeout: 30_000,
  });
  return again;
};

const openDefenses = async (page: Page) => {
  await page.keyboard.press("Control+Shift+d");
  const browser = page.getByRole("dialog", { name: "Defenses" });
  await expect(browser).toBeVisible();
  return browser;
};

test("organizes a library: empty books, saved fronts, copy and move, install order, and the shelf", async ({
  page: first,
}, testInfo) => {
  test.setTimeout(90_000);
  let page = first;
  await openSeededEditor(page);
  let shelf = await openShelf(page);

  // Every card counts its units, not only the open book's.
  const starter = card(shelf, "Chalk Starter Playbook");
  await expect(starter.locator(".shelf-units")).toHaveText(
    "8 plays · 7 offense · 1 defense",
  );

  // A new book starts empty and asks which side its first Play is for.
  await shelf
    .getByRole("textbox", { name: "New playbook name" })
    .fill("4-3 Base Defense");
  await shelf.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".book-title strong")).toHaveText(
    "4-3 Base Defense",
  );
  await expect(page.locator(".book-title span")).toHaveText("0 plays");
  const empty = page.locator(".playbook-none");
  await expect(empty).toContainText("No plays yet");
  await empty.getByRole("button", { name: "New defensive play" }).click();

  // A front built on the field is saved under Mine…
  let defenses = await openDefenses(page);
  await expect(defenses.getByRole("tab", { name: "Mine" })).toBeVisible();
  await defenses
    .getByRole("textbox", { name: "Search defenses" })
    .fill("4-3 Cover 3");
  await defenses.getByText("4-3 Cover 3", { exact: true }).click();
  await expect(defenses).toBeHidden();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await page.getByRole("textbox", { name: "Play name" }).fill("Base Cover 3");
  await page.getByRole("textbox", { name: "Play name" }).press("Enter");
  // The Coach walks a man down into the box by hand.
  const defender = await page
    .locator("[data-scene-player]")
    .first()
    .boundingBox();
  if (!defender) throw new Error("No defender on the field.");
  const from = {
    x: defender.x + defender.width / 2,
    y: defender.y + defender.height / 2,
  };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 20, { steps: 4 });
  await page.mouse.move(from.x + 60, from.y + 40, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  defenses = await openDefenses(page);
  const saveAs = defenses.getByRole("textbox", {
    name: "Save the defense on the field as",
  });
  await saveAs.fill("Goal Line 6-2");
  await defenses.getByRole("button", { name: "Save", exact: true }).click();
  await expect(defenses.getByRole("tab", { name: "Mine" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const mine = defenses.locator(".browser-card");
  await expect(mine).toHaveCount(1);
  await expect(mine).toContainText("Goal Line 6-2");
  await expect(mine).toContainText("11 men");
  await page.keyboard.press("Escape");

  // …and is one pick away on the next Play.
  await views(page)
    .getByRole("button", { name: "Playbooks", exact: true })
    .click();
  await page.getByRole("button", { name: "New play" }).click();
  await page.getByRole("button", { name: /^New defensive play/ }).click();
  await page
    .getByRole("textbox", { name: "Play name" })
    .fill("Goal Line Pinch");
  await page.getByRole("textbox", { name: "Play name" }).press("Enter");
  defenses = await openDefenses(page);
  await defenses.getByRole("tab", { name: "Mine" }).click();
  await defenses
    .getByRole("button", { name: "Goal Line 6-2", exact: true })
    .click();
  await expect(defenses).toBeHidden();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  defenses = await openDefenses(page);
  await defenses.getByRole("tab", { name: "Mine" }).click();
  await expect(defenses.locator(".browser-card.on-field")).toContainText(
    "Goal Line 6-2",
  );
  await page.keyboard.press("Escape");

  // Plays are copied and moved between books from the cross-book Plays page.
  await views(page)
    .getByRole("button", { name: "Playbooks", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Playbooks pages" })
    .getByRole("button", { name: "Plays", exact: true })
    .click();
  let sheet = await playAction(page, "Stick — Thunder", "Copy to…");
  await sheet
    .getByRole("group", { name: "Copy to" })
    .getByRole("button", { name: /^4-3 Base Defense/ })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "copied" }),
  ).toHaveText("Stick — Thunder copied to 4-3 Base Defense.");
  sheet = await playAction(page, "Cover 3 — Fire Zone", "Move to…");
  await sheet
    .getByRole("group", { name: "Move to" })
    .getByRole("button", { name: /^4-3 Base Defense/ })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "moved" }),
  ).toHaveText("Cover 3 — Fire Zone moved to 4-3 Base Defense.");

  // The copy kept its Concept: the book it landed in now holds Stick.
  await page
    .getByRole("navigation", { name: "Playbooks pages" })
    .getByRole("button", { name: "Playbooks", exact: true })
    .click();
  await expect(page.locator(".book-title span")).toHaveText("4 plays");
  await page
    .getByRole("navigation", { name: "Playbooks pages" })
    .getByRole("button", { name: "Plays", exact: true })
    .click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByRole("button", { name: /^Concept/ }).click();
  await expect(page.getByRole("option", { name: /^Stick\b/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // The book's own page puts its Plays in install order.
  await page
    .getByRole("navigation", { name: "Playbooks pages" })
    .getByRole("button", { name: "Playbooks", exact: true })
    .click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  const sort = page.getByRole("combobox", { name: "Sort plays" });
  await sort.selectOption("order");
  await expect(playNames(page)).toHaveText([
    "Base Cover 3",
    "Cover 3 — Fire Zone",
    "Goal Line Pinch",
    "Stick — Thunder",
  ]);
  await closeSheet(page, "Goal Line Pinch");
  await expect(playNames(page)).toHaveText([
    "Base Cover 3",
    "Goal Line Pinch",
    "Cover 3 — Fire Zone",
    "Stick — Thunder",
  ]);
  // A card drags into place, where the browser can drag natively.
  if (testInfo.project.name === "chromium") {
    await page
      .locator("[data-play-id]", { hasText: "Stick — Thunder" })
      .dragTo(page.locator("[data-play-id]", { hasText: "Base Cover 3" }), {
        targetPosition: { x: 20, y: 4 },
      });
  } else {
    for (let step = 0; step < 3; step += 1) {
      await closeSheet(page, "Stick — Thunder");
    }
  }
  const installed = [
    "Stick — Thunder",
    "Base Cover 3",
    "Goal Line Pinch",
    "Cover 3 — Fire Zone",
  ];
  await expect(playNames(page)).toHaveText(installed);

  // The order is kept with the book, and its full-playbook export reads in it.
  page = await reopen(page);
  await views(page)
    .getByRole("button", { name: "Playbooks", exact: true })
    .click();
  await expect(playNames(page)).toHaveText(installed);
  await toEditor(page);
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Print & export", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Print preview", exact: true })
    .click();
  const output = page.getByRole("region", { name: "Print & export" });
  await output.getByRole("radio", { name: "Full playbook" }).click();
  await expect(
    output.getByRole("status", { name: "What prints" }),
  ).toContainText("Full playbook: Full playbook · 4 plays · in install order");
  await page.keyboard.press("Escape");

  // The shelf: rename, duplicate, archive and restore, delete, and sort.
  shelf = await openShelf(page);
  await expect(
    card(shelf, "4-3 Base Defense").locator(".shelf-units"),
  ).toHaveText("4 plays · 1 offense · 3 defense");
  await expect(
    card(shelf, "Chalk Starter Playbook").locator(".shelf-units"),
  ).toHaveText("7 plays · 7 offense · 0 defense");
  sheet = await shelfAction(shelf, "Chalk Starter Playbook", "Rename…");
  const renameField = sheet.getByRole("textbox", { name: "Playbook name" });
  await renameField.fill("4-3 base defense");
  await expect(renameField).toHaveAttribute("aria-invalid", "true");
  await renameField.fill("Base Offense");
  await renameField.press("Enter");
  await expect(card(shelf, "Base Offense")).toHaveCount(1);

  await shelfAction(shelf, "4-3 Base Defense", "Duplicate");
  await expect(
    page.getByRole("status").filter({ hasText: "a copy of" }),
  ).toHaveText(
    "4-3 Base Defense copy — a copy of 4-3 Base Defense, on the shelf.",
  );
  const copy = card(shelf, "4-3 Base Defense copy");
  await expect(copy.locator(".shelf-units")).toHaveText(
    "4 plays · 1 offense · 3 defense",
  );

  // The open book is put away by opening the next one first.
  await shelfAction(shelf, "4-3 Base Defense", "Archive");
  const archived = shelf.getByRole("region", { name: "Archived playbooks" });
  await expect(
    archived.getByRole("button", { name: /Archived/ }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(card(shelf, "4-3 Base Defense")).toHaveCount(0);
  await expect(shelf.locator(".shelf-card.open strong")).toHaveText(
    "4-3 Base Defense copy",
  );
  await archived.getByRole("button", { name: /Archived/ }).click();
  await archived
    .getByRole("button", { name: "Restore 4-3 Base Defense" })
    .click();
  await expect(
    shelf.getByRole("region", { name: "Archived playbooks" }),
  ).toHaveCount(0);

  sheet = await shelfAction(shelf, "Base Offense", "Delete…");
  await expect(sheet).toContainText(
    "Its 7 plays go to the Trash, and its game plans and saved sets are removed with it.",
  );
  await sheet.getByRole("button", { name: "Keep it" }).click();
  await sheet.getByRole("button", { name: "Delete…" }).click();
  await sheet.getByRole("button", { name: "Delete playbook" }).click();
  await expect(card(shelf, "Base Offense")).toHaveCount(0);

  // A book never deletes the last one on the shelf.
  const sortShelf = shelf.getByRole("combobox", { name: "Sort playbooks" });
  await sortShelf.selectOption("name");
  await expect(shelf.locator(".shelf-grid .shelf-card strong")).toHaveText([
    "4-3 Base Defense",
    "4-3 Base Defense copy",
  ]);

  // Chalk opened again keeps the shelf's sort and the saved front.
  page = await reopen(page);
  shelf = await openShelf(page);
  await expect(
    shelf.getByRole("combobox", { name: "Sort playbooks" }),
  ).toHaveValue("name");
  await expect(shelf.locator(".shelf-grid .shelf-card strong")).toHaveText([
    "4-3 Base Defense",
    "4-3 Base Defense copy",
  ]);
  await page.screenshot({
    path: testInfo.outputPath("playbook-library-shelf.png"),
    // "Edited 3 days ago" reads the clock; masked, a rerun draws the same.
    mask: [page.locator(".shelf-line:not(.shelf-units)")],
    fullPage: true,
  });
});
