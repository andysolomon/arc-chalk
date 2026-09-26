import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * The Playbooks destination on a phone (ADR 0060): three pages across one
 * row, the book's plays as a list a finger can read, and every filter a
 * sheet up from the bottom with a line to narrow it by.
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

const openPlaybooks = async (page: Page) => {
  await page.goto("/");
  await expect(page.locator("header.topbar.phone-topbar")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Playbooks", exact: true })
    .tap();
  const pages = page.getByRole("navigation", { name: "Playbooks pages" });
  await expect(pages).toBeVisible();
  return pages;
};

for (const viewport of VIEWPORTS) {
  test.describe(`phone playbooks at ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });

    test("puts the three pages on one row and lists the book's plays", async ({
      page,
    }, testInfo) => {
      const pages = await openPlaybooks(page);
      const tabs = pages.getByRole("button");
      await expect(tabs).toHaveCount(3);
      const rows = new Set<number>();
      for (const tab of await tabs.all()) {
        const rect = await box(tab);
        expect(rect.height).toBeGreaterThanOrEqual(44);
        rows.add(Math.round(rect.y));
      }
      expect(rows.size).toBe(1);

      // A phone lists by default; cards are one tap away.
      const scroller = page.locator(".playbook-scroll");
      await expect(scroller).toHaveAttribute("data-layout", "list");
      await page
        .getByRole("group", { name: "Layout" })
        .getByRole("button", { name: "Cards" })
        .tap();
      await expect(scroller).toHaveAttribute("data-layout", "grid");
      await expect(scroller).toHaveAttribute("data-grid-columns", "1");
      await page
        .getByRole("group", { name: "Layout" })
        .getByRole("button", { name: "List" })
        .tap();
      await expect(scroller).toHaveAttribute("data-layout", "list");
      await noRootOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath("phone-playbooks-book.png"),
        fullPage: true,
      });
    });

    test("opens a filter as a sheet from the bottom", async ({
      page,
    }, testInfo) => {
      const pages = await openPlaybooks(page);
      await pages.getByRole("button", { name: "Plays", exact: true }).tap();
      const filters = page.getByRole("group", { name: "Filter plays" });
      const personnel = filters.getByRole("button", { name: "Personnel" });
      await personnel.scrollIntoViewIfNeeded();
      await personnel.tap();
      const sheet = page.getByRole("dialog", { name: "Filter personnel" });
      await expect(sheet).toBeVisible();
      const rect = await box(sheet);
      expect(rect.x).toBeLessThanOrEqual(0.5);
      expect(rect.width).toBeGreaterThanOrEqual(viewport.width - 1);
      expect(rect.y + rect.height).toBeGreaterThanOrEqual(viewport.height - 1);
      const all = sheet.getByRole("option", { name: "All" });
      await expect(all).toHaveAttribute("aria-selected", "true");
      expect((await box(all)).height).toBeGreaterThanOrEqual(44);
      await page.screenshot({
        path: testInfo.outputPath("phone-personnel-sheet.png"),
        fullPage: false,
      });
      const first = sheet.getByRole("option").nth(1);
      const label = (await first.locator(".choice-name").textContent()) ?? "";
      await first.tap();
      await expect(sheet).toBeHidden();
      await expect(
        filters.getByRole("button", { name: /^Personnel: / }),
      ).toBeVisible();
      expect(label.length).toBeGreaterThan(0);
      await noRootOverflow(page);
    });

    test("lays the Formations page out two across with its filters on one line", async ({
      page,
    }, testInfo) => {
      const pages = await openPlaybooks(page);
      await pages
        .getByRole("button", { name: "Formations", exact: true })
        .tap();
      const formations = page.getByRole("region", { name: "Formations" });
      await expect(formations).toBeVisible();
      const cards = formations.locator(".formation-card");
      await expect(cards.first()).toBeVisible();
      const first = await box(cards.nth(0));
      const second = await box(cards.nth(1));
      expect(Math.abs(first.y - second.y)).toBeLessThan(12);
      expect(first.width).toBeGreaterThanOrEqual(140);
      expect(second.x).toBeGreaterThan(first.x + first.width / 2);
      const third = await box(cards.nth(2));
      expect(third.y).toBeGreaterThan(first.y + first.height / 2);
      const filters = formations.getByRole("group", {
        name: "Filter formations",
      });
      const chipRows = new Set<number>();
      for (const chip of await filters.getByRole("button").all()) {
        chipRows.add(Math.round((await box(chip)).y));
      }
      expect(chipRows.size).toBe(1);
      await noRootOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath("phone-formations.png"),
        fullPage: true,
      });
    });
  });
}
