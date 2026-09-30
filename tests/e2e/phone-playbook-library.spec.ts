import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Organizing a library on a phone (issue #166): a book's actions and a
 * Play's rise from the bottom as sheets a thumb can reach; a new book starts
 * empty with a start for either side; a Play is copied into another book;
 * and the install order is set with Move earlier, since a finger cannot
 * count on dragging. Every card on the shelf counts its offense and defense.
 * Each run ends with a screenshot of the shelf in the test's output folder.
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

const noRootOverflow = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);

/** A sheet sits on the bottom edge, full width, its buttons a thumb's size. */
const expectBottomSheet = async (page: Page, sheet: Locator) => {
  const viewport = page.viewportSize()!;
  const rect = await box(sheet);
  expect(Math.round(rect.y + rect.height)).toBe(viewport.height);
  expect(Math.round(rect.width)).toBe(viewport.width);
  for (const button of await sheet.getByRole("button").all()) {
    if (!(await button.isVisible())) continue;
    expect((await box(button)).height).toBeGreaterThanOrEqual(44);
  }
};

const playNames = (page: Page) =>
  page.locator(".playbook-scroll [data-play-id] .playbook-text strong");

for (const viewport of VIEWPORTS) {
  test.describe(`phone library at ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });

    test("organizes books and plays from sheets a thumb can reach", async ({
      page,
    }, testInfo) => {
      await page.goto("/");
      await expect(page.locator("header.topbar.phone-topbar")).toBeVisible();
      const pages = page.getByRole("navigation", { name: "Playbooks pages" });
      await page
        .getByRole("navigation", { name: "Workspace views" })
        .getByRole("button", { name: "Playbooks", exact: true })
        .tap();
      await expect(pages).toBeVisible();

      // Install order, set one step at a time from a Play's sheet.
      await page
        .getByRole("combobox", { name: "Sort plays" })
        .selectOption("order");
      await expect(playNames(page).first()).toHaveText("Cover 3 — Fire Zone");
      await page
        .getByRole("button", {
          name: "Actions for Four Verticals",
          exact: true,
        })
        .tap();
      let sheet = page.getByRole("dialog", { name: "Four Verticals" });
      await expectBottomSheet(page, sheet);
      await sheet.getByRole("button", { name: "Move earlier" }).tap();
      await expect(playNames(page).first()).toHaveText("Four Verticals");
      await sheet.getByRole("button", { name: "Cancel" }).tap();
      await expect(sheet).toBeHidden();

      // A new book starts empty, with a start for either side.
      await page
        .locator(".book-head")
        .getByRole("button", { name: "Playbooks" })
        .tap();
      const shelf = page.getByRole("region", { name: "Playbooks" });
      await shelf
        .getByRole("textbox", { name: "New playbook name" })
        .fill("Red Zone");
      await shelf.getByRole("button", { name: "Save", exact: true }).tap();
      await expect(page.locator(".book-title span")).toHaveText("0 plays");
      for (const side of ["New offensive play", "New defensive play"]) {
        const start = page.getByRole("button", { name: side });
        expect((await box(start)).height).toBeGreaterThanOrEqual(44);
      }

      // A Play of the starter book is copied into it from the Plays page.
      await pages.getByRole("button", { name: "Plays", exact: true }).tap();
      await page
        .getByRole("button", {
          name: "Actions for Four Verticals",
          exact: true,
        })
        .tap();
      sheet = page.getByRole("dialog", { name: "Four Verticals" });
      await sheet.getByRole("button", { name: "Copy to…" }).tap();
      await expectBottomSheet(page, sheet);
      await sheet
        .getByRole("group", { name: "Copy to" })
        .getByRole("button", { name: /^Red Zone/ })
        .tap();
      await expect(
        page.getByRole("status").filter({ hasText: "copied" }),
      ).toHaveText("Four Verticals copied to Red Zone.");

      // Every card counts its units; a book's actions are a sheet too.
      await pages.getByRole("button", { name: "Playbooks", exact: true }).tap();
      await page
        .locator(".book-head")
        .getByRole("button", { name: "Playbooks" })
        .tap();
      const units = (name: string) =>
        shelf
          .locator(".shelf-card")
          .filter({ has: page.getByText(name, { exact: true }) })
          .locator(".shelf-units");
      await expect(units("Red Zone")).toHaveText(
        "1 play · 1 offense · 0 defense",
      );
      await expect(units("Chalk Starter Playbook")).toHaveText(
        "8 plays · 7 offense · 1 defense",
      );
      await shelf
        .getByRole("button", { name: "Actions for Red Zone", exact: true })
        .tap();
      sheet = page.getByRole("dialog", { name: "Red Zone", exact: true });
      await expectBottomSheet(page, sheet);
      await sheet.getByRole("button", { name: "Duplicate" }).tap();
      await expect(units("Red Zone copy")).toHaveText(
        "1 play · 1 offense · 0 defense",
      );
      await noRootOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath("phone-playbook-library-shelf.png"),
        // "Edited 3 days ago" reads the clock; masked, a rerun draws the same.
        mask: [page.locator(".shelf-line:not(.shelf-units)")],
        fullPage: true,
      });
    });
  });
}
