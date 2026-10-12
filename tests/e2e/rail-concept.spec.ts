import { type Page } from "@playwright/test";

import { expect, openBlankEditor, test } from "./fixtures";

/**
 * The rail's play call (ADR 0078): beside the set and the shadow, a button
 * that opens the catalogue the inspector's Concept row opens, on its
 * Concepts — or, on a defensive play, on its Coverages. It is grey while
 * nobody on the field could run one, and drawing from it is the same call
 * the inspector makes. The field with the concept drawn, and the rail beside
 * it, are the artifacts.
 */

const rail = (page: Page) =>
  page.getByRole("navigation", { name: "Drawing tools" });
const inspector = (page: Page) =>
  page.getByRole("complementary", { name: "Play inspector" });
const lines = (page: Page) => page.locator("[data-scene-path-group]");

async function newPlay(page: Page, unit: "offensive" | "defensive") {
  await page
    .getByRole("banner")
    .getByRole("button", { name: "New play", exact: true })
    .click();
  await page
    .getByRole("group", { name: "New play" })
    .getByRole("button", { name: new RegExp(`^New ${unit} play`) })
    .click();
}

async function pick(
  page: Page,
  dialog: "Formations" | "Defenses",
  name: string,
) {
  const browser = page.getByRole("dialog", { name: dialog });
  await expect(browser).toBeVisible();
  await browser.getByText(name, { exact: true }).click();
  await expect(browser).toBeHidden();
}

async function settle(page: Page) {
  await page.mouse.move(0, 0);
  await expect(page.locator(".toast")).toBeHidden({ timeout: 10_000 });
}

test("the rail draws a concept on an offensive play", async ({
  page,
}, testInfo) => {
  await openBlankEditor(page);
  const concept = rail(page).getByRole("button", {
    name: "Add or change the concept",
    exact: true,
  });

  // A blank field has nobody to run a concept, so the button is grey.
  await newPlay(page, "offensive");
  await page
    .getByRole("dialog", { name: "Formations" })
    .getByTitle("Close — esc")
    .click();
  await expect(concept).toBeDisabled();

  await rail(page)
    .getByRole("button", { name: "Add or change the formation — ⇧⌘F" })
    .click();
  await pick(page, "Formations", "Gun Doubles Right");
  await expect(concept).toBeEnabled();
  await expect(lines(page)).toHaveCount(0);

  // It opens the catalogue on its Concepts.
  await concept.click();
  const picker = page.getByRole("dialog", { name: "Concepts and line calls" });
  await expect(picker).toBeVisible();
  await expect(
    picker.getByRole("button", { name: "Concepts", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(picker.locator(".preset-kind")).not.toContainText(["Line call"]);

  await picker
    .getByRole("button", { name: /^Mesh Concept/ })
    .first()
    .click();
  await expect(picker).toBeHidden();
  await expect(page.getByRole("status")).toContainText("Mesh");
  await expect(page.getByRole("status")).toContainText("routes drawn");
  await expect(
    inspector(page).getByRole("button", { name: /Concept ›/ }),
  ).toContainText("Mesh");
  expect(await lines(page).count()).toBeGreaterThan(0);

  // Changing it is the same press.
  await concept.click();
  await picker
    .getByRole("button", { name: /^Smash Concept/ })
    .first()
    .click();
  await expect(picker).toBeHidden();
  await expect(
    inspector(page).getByRole("button", { name: /Concept ›/ }),
  ).toContainText("Smash");

  await settle(page);
  await page.screenshot({ path: testInfo.outputPath("rail-concept.png") });
  await rail(page).screenshot({
    path: testInfo.outputPath("rail-concept-rail.png"),
  });
});

test("the rail calls a coverage on a defensive play", async ({
  page,
}, testInfo) => {
  await openBlankEditor(page);
  const coverage = rail(page).getByRole("button", {
    name: "Add or change the coverage",
    exact: true,
  });

  await newPlay(page, "defensive");
  await page
    .getByRole("dialog", { name: "Defenses" })
    .getByTitle("Close — esc")
    .click();
  await expect(coverage).toBeDisabled();
  await expect(
    rail(page).getByRole("button", { name: "Add or change the concept" }),
  ).toHaveCount(0);

  await rail(page)
    .getByRole("button", { name: "Add or change the defense — ⇧⌘D" })
    .click();
  await pick(page, "Defenses", "4-3 Cover 3");
  await expect(coverage).toBeEnabled();

  await coverage.click();
  const picker = page.getByRole("dialog", { name: "Unit calls" });
  await expect(picker).toBeVisible();
  await expect(
    picker.getByRole("button", { name: "Coverages", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await picker
    .locator(".preset-choice")
    .filter({ has: page.locator(".preset-name", { hasText: /^Cover 2$/ }) })
    .first()
    .click();
  await expect(picker).toBeHidden();
  await expect(
    inspector(page).locator('.play-call [data-unit-call="coverage"]'),
  ).toContainText("Cover 2");

  await settle(page);
  await page.screenshot({
    path: testInfo.outputPath("rail-coverage.png"),
  });
});
