import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Overlay formation, defense, and play cards on a phone. The desktop books
 * stay four- and three-across; here a finger needs a picture it can read.
 */
const PHONE = { width: 390, height: 844 };

const box = async (locator: Locator) => {
  const rect = await locator.boundingBox();
  expect(rect, await locator.evaluate((node) => node.outerHTML)).not.toBeNull();
  return rect!;
};

/** Opens the editor and the sidebar drawer, where formations and the library are (ADR 0058). */
const enterEditorOnPhone = async (page: Page) => {
  await page.goto("/");
  await expect(page.locator("header.topbar.phone-topbar")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Drawing tools" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open the sidebar" }).click();
  await expect(page.getByRole("navigation", { name: "Sidebar" })).toBeVisible();
};

test.describe("phone overlay cards", () => {
  test.use({
    viewport: PHONE,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });

  test("lays formation cards two across, large enough to read", async ({
    page,
  }) => {
    await enterEditorOnPhone(page);
    await page.getByTitle("Browse formations — ⇧⌘F").click();
    const book = page.getByRole("dialog", { name: "Formations" });
    await expect(book).toBeVisible();

    const cards = book.locator(".browser-card");
    await expect(cards.first()).toBeVisible();
    const first = await box(cards.nth(0));
    const second = await box(cards.nth(1));
    expect(Math.abs(first.y - second.y)).toBeLessThan(12);
    expect(first.width).toBeGreaterThanOrEqual(140);
    expect(second.x).toBeGreaterThan(first.x + first.width / 2);
    await expect(cards.nth(0)).toContainText(/Gun|Trips|Bunch|Empty/i);
  });

  test("gives play cards a full-width tile and a tall diagram", async ({
    page,
  }) => {
    await enterEditorOnPhone(page);
    const sidebar = page.getByRole("navigation", { name: "Sidebar" });
    await sidebar.getByRole("button", { name: /^Library/ }).click();
    await sidebar.getByRole("button", { name: "Browse Playbook" }).click();
    const book = page.getByRole("dialog", { name: "Playbook" });
    await expect(book).toBeVisible();
    await expect(book.locator(".playbook-scroll")).toHaveAttribute(
      "data-grid-columns",
      "1",
    );

    const card = book.locator(".playbook-card").first();
    await expect(card).toBeVisible();
    const tile = await box(card);
    expect(tile.width).toBeGreaterThanOrEqual(250);
    const thumb = await box(card.locator(".playbook-thumb"));
    expect(thumb.height).toBeGreaterThanOrEqual(120);
  });
});
