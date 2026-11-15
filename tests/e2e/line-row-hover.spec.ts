import { type Page } from "@playwright/test";

import { expect, openSeededEditor, test } from "./fixtures";

/**
 * On desktop, the mouse over one of a man's lines in his panel lights that
 * line on the field, and only that one. Moving off the row puts the light
 * out, and so does opening the line from the row, which takes the row away
 * under the pointer. The field with H's Dig lit is the run's artifact.
 */
test.use({ viewport: { width: 1440, height: 960 } });

const inspector = (page: Page) =>
  page.getByRole("complementary", { name: "Play inspector" });

/** A new offensive play, lined up in Gun Trips Right and running Mesh. */
async function meshFromGunTripsRight(page: Page): Promise<void> {
  await openSeededEditor(page);
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("banner").locator("button.new-play").click();
  const name = page.getByRole("textbox", { name: "Play name" });
  await name.fill("Mesh — line hover");
  await name.press("Enter");
  await page.getByTitle("Browse formations — ⇧⌘F").click();
  await page
    .getByRole("dialog", { name: "Formations" })
    .getByText("Gun Trips Right", { exact: true })
    .click();
  await inspector(page)
    .getByRole("button", { name: /Concept ›/ })
    .click();
  await page
    .getByRole("dialog", { name: "Concepts and line calls" })
    .getByRole("button", { name: /^Mesh/ })
    .first()
    .click();
  await expect(
    inspector(page).getByRole("button", { name: "H: DIG — Slot" }),
  ).toBeVisible();
}

test("lights the hovered line on the field", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await meshFromGunTripsRight(page);
  await inspector(page).getByRole("button", { name: "H: DIG — Slot" }).click();

  const lit = page.locator("[data-highlighted-path]");
  const dig = page.getByRole("img", { name: "H route: DIG" });
  const row = inspector(page).getByRole("button", { name: "Edit Route" });
  await expect(lit).toHaveCount(0);

  // Over the row, his Dig and nothing else is lit.
  await row.hover();
  await expect(dig.locator("[data-highlighted-path]").first()).toBeVisible();
  const litPaths = await lit.evaluateAll((nodes) => [
    ...new Set(nodes.map((node) => node.getAttribute("data-highlighted-path"))),
  ]);
  expect(litPaths).toHaveLength(1);

  await expect(page.locator(".toast")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("dig-lit.png"),
  });

  // Off the row, the light goes out.
  await page.mouse.move(5, 5);
  await expect(lit).toHaveCount(0);

  // Opening the line from the row takes the row away; the light goes too.
  await row.hover();
  await expect(lit.first()).toBeVisible();
  await row.click();
  await expect(row).toHaveCount(0);
  await expect(lit).toHaveCount(0);
});
