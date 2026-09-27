import type { Page } from "@playwright/test";

import { expect, openSeededEditor, test } from "./fixtures";

/**
 * Playbooks saved by name (ADR 0062): the shelf names and saves a new book
 * and opens it, the open book's bar renames it, a name another book already
 * answers to is refused, and the names are still there when Chalk opens
 * again. The test ends with a screenshot of the shelf it left the Coach on.
 */

const openShelf = async (page: Page) => {
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Playbooks", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Playbooks$/ })
    .last()
    .click();
  const shelf = page.getByRole("region", { name: "Playbooks" });
  await expect(shelf).toBeVisible();
  return shelf;
};

test("saves a new playbook by name, renames it, and keeps both names", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  const shelf = await openShelf(page);
  await expect(shelf.locator(".shelf-card")).toHaveCount(1);

  // A name the starter book already answers to is refused, case aside.
  const newName = shelf.getByRole("textbox", { name: "New playbook name" });
  const save = shelf.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeDisabled();
  await newName.fill("chalk starter playbook");
  await expect(save).toBeDisabled();
  await expect(newName).toHaveAttribute("aria-invalid", "true");
  await expect(shelf).toContainText(
    "Chalk Starter Playbook is already on this device.",
  );

  // A new name saves a book and opens it on the blank Play the editor
  // takes up in an empty book (ADR 0060).
  await newName.fill("  Spring   Install ");
  await expect(save).toBeEnabled();
  await newName.press("Enter");
  const title = page.locator(".book-title strong");
  await expect(title).toHaveText("Spring Install");
  await expect(page.locator(".book-title span")).toHaveText("1 play");

  // The bar renames the open book; another book's name is refused there too.
  await page.getByRole("button", { name: "Rename Spring Install" }).click();
  const rename = page.getByRole("form", { name: "Playbook name" });
  const renameField = rename.getByRole("textbox", { name: "Playbook name" });
  await expect(renameField).toBeFocused();
  await expect(renameField).toHaveValue("Spring Install");
  const renameSave = rename.getByRole("button", { name: "Save" });
  await expect(renameSave).toBeDisabled();
  await renameField.fill("Chalk Starter Playbook");
  await expect(renameSave).toBeDisabled();
  await renameField.fill("Spring Install 2026");
  await renameSave.click();
  await expect(title).toHaveText("Spring Install 2026");

  // Escape puts a rename down without saving it.
  await page
    .getByRole("button", { name: "Rename Spring Install 2026" })
    .click();
  await renameField.fill("Never saved");
  await renameField.press("Escape");
  await expect(rename).toBeHidden();
  await expect(title).toHaveText("Spring Install 2026");
  await expect(
    page.getByRole("navigation", { name: "Book pages" }),
  ).toBeVisible();

  // Both books are on the shelf, the new one open.
  await page
    .getByRole("button", { name: /Playbooks$/ })
    .last()
    .click();
  await expect(shelf.locator(".shelf-card")).toHaveCount(2);
  await expect(shelf.locator(".shelf-card.open strong")).toHaveText(
    "Spring Install 2026",
  );

  // Chalk opened again on this device still knows both books by name and
  // comes back to the one that was open.
  const context = page.context();
  await page.close();
  const again = await context.newPage();
  await again.setViewportSize({ width: 1440, height: 960 });
  await again.goto("/");
  await expect(again.getByRole("textbox", { name: "Play name" })).toBeVisible({
    timeout: 30_000,
  });
  const reopened = await openShelf(again);
  await expect(reopened.locator(".shelf-card strong")).toHaveText([
    "Spring Install 2026",
    "Chalk Starter Playbook",
  ]);
  await expect(reopened.locator(".shelf-card.open strong")).toHaveText(
    "Spring Install 2026",
  );
  await again.screenshot({
    path: testInfo.outputPath("playbook-names-shelf.png"),
    fullPage: true,
  });
});
