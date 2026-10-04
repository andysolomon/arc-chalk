import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * A Play's card on a phone: a tap on a Play in the open book raises its card
 * from the bottom, the Play drawn across the glass, with Open in editor
 * under a thumb and the book's other Plays a tap either side. The list's
 * pictures are large enough to tell one Play from another. Each run ends
 * with a screenshot of the card in the test's output folder.
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

for (const viewport of VIEWPORTS) {
  test.describe(`phone play card at ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });

    test("raises a play's card from the list and opens it in the editor", async ({
      page,
    }, testInfo) => {
      await page.goto("/");
      await expect(page.locator("header.topbar.phone-topbar")).toBeVisible();
      await page
        .getByRole("navigation", { name: "Workspace views" })
        .getByRole("button", { name: "Playbooks", exact: true })
        .tap();
      await expect(page.locator(".playbook-scroll")).toHaveAttribute(
        "data-layout",
        "list",
      );
      await page
        .getByRole("combobox", { name: "Sort plays" })
        .selectOption("name");

      // The list's picture is big enough to read a Play by.
      const row = page.locator(".playbook-scroll [data-play-id]", {
        hasText: "Four Verticals",
      });
      const thumb = await box(row.locator(".playbook-thumb"));
      expect(thumb.width).toBeGreaterThanOrEqual(120);
      expect(thumb.height).toBeGreaterThanOrEqual(64);

      // A tap raises the card from the bottom, full width.
      await row.locator(".playbook-open").tap();
      const card = page.getByRole("dialog", { name: "Four Verticals" });
      await expect(card).toBeVisible();
      const rect = await box(card);
      expect(Math.round(rect.y + rect.height)).toBe(viewport.height);
      expect(Math.round(rect.width)).toBe(viewport.width);
      const field = card.getByRole("img", {
        name: "Four Verticals football play",
      });
      await expect(field.locator("[data-scene-path]")).not.toHaveCount(0);
      expect((await box(field)).width).toBeGreaterThanOrEqual(
        viewport.width - 40,
      );
      for (const button of await card.getByRole("button").all()) {
        expect((await box(button)).height).toBeGreaterThanOrEqual(36);
      }
      const open = card.getByRole("button", { name: "Open in editor" });
      expect((await box(open)).height).toBeGreaterThanOrEqual(44);

      // Next walks the book; the page stays where it was under the card.
      await card.getByRole("button", { name: "Next play" }).tap();
      await expect(card).toBeHidden();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Previous play" })
        .tap();
      await expect(card).toBeVisible();
      await noRootOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath("phone-play-card.png"),
      });

      await open.tap();
      await expect(
        page.getByRole("textbox", { name: "Play name" }),
      ).toHaveValue("Four Verticals");
    });
  });
}
