import { type Page } from "@playwright/test";

import { expect, openBlankEditor, test } from "./fixtures";

/**
 * The tool rail on a phone (ADR 0077): the row under the field carries the
 * Formation button, the shadow, Text, Clear every line, Clear every player
 * and the trash, each a finger's 44 px and all of them on the glass at
 * 390 px. A new play from More opens on the Formations browser; the rail
 * adds a shadow defense, takes every man off, and puts a set back on. The
 * field with the last set on it is the run's artifact.
 */
test.use({ viewport: { width: 390, height: 844 } });

async function pick(
  page: Page,
  dialog: "Formations" | "Defenses",
  name: string,
) {
  const browser = page.getByRole("dialog", { name: dialog });
  await expect(browser).toBeVisible();
  await browser.getByText(name, { exact: true }).tap();
  await expect(browser).toBeHidden();
}

test("the phone's tool row puts men on and takes them off", async ({
  page,
}, testInfo) => {
  await openBlankEditor(page);
  await expect(page.locator(".chalk-shell.phone-workspace")).toBeVisible();
  const tools = page.getByRole("navigation", { name: "Drawing tools" });
  const men = page.locator("[data-scene-player]");

  for (const name of [
    "Add or change the formation — ⇧⌘F",
    "Add a shadow defense — ⇧⌘D",
    "Text — T",
    "Clear every line",
    "Clear every player",
    "Delete selection — ⌫",
  ]) {
    const button = tools.getByRole("button", { name, exact: true });
    const box = (await button.boundingBox())!;
    expect(box.height, name).toBeGreaterThanOrEqual(44);
    expect(box.x, name).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, name).toBeLessThanOrEqual(390);
  }

  // A new play from More opens on the set to start from.
  await page.getByRole("button", { name: "More actions", exact: true }).tap();
  await page
    .locator(".more-panel")
    .getByRole("button", { name: /^New offensive play/ })
    .tap();
  await pick(page, "Formations", "Gun Doubles Right");
  await expect(men).toHaveCount(11);

  // The shadow button adds the defense, and is then its on/off.
  await tools.getByRole("button", { name: "Add a shadow defense — ⇧⌘D" }).tap();
  await pick(page, "Defenses", "4-3 Cover 3");
  await expect(men).toHaveCount(22);
  await expect(
    tools.getByRole("button", { name: "Shadow defense — H" }),
  ).toHaveAttribute("aria-pressed", "true");

  // Every man off, both sides; then a set back on from the rail.
  await tools.getByRole("button", { name: "Clear every player" }).tap();
  await expect(men).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    "Clear every player — 22 men off",
  );
  await tools
    .getByRole("button", { name: "Add or change the formation — ⇧⌘F" })
    .tap();
  await pick(page, "Formations", "Gun Trips Right");
  await expect(men).toHaveCount(11);

  await expect(page.locator(".toast")).toBeHidden({ timeout: 10_000 });
  await page.screenshot({ path: testInfo.outputPath("phone-toolbar.png") });
});
