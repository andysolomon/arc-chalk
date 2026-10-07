import { type Page } from "@playwright/test";

import { expect, openBlankEditor, test } from "./fixtures";

/**
 * The tool rail puts men on and takes them off (ADR 0077). A new play opens
 * on the browser for its unit, so the set is the first thing chosen, and
 * closing it leaves the field blank. From a blank field the rail's Formation
 * button puts a set on or changes it, its shadow button adds the other unit
 * and then shows or hides it, Clear every line and Clear every player take
 * the routes or the men off, and the trash takes what is picked. The field
 * after each run, and the rail beside it, are the artifacts.
 */

const rail = (page: Page) =>
  page.getByRole("navigation", { name: "Drawing tools" });
const men = (page: Page) => page.locator("[data-scene-player]");
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
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Untitled play",
  );
}

/** Picks a card from a browser that is already open, and waits for it to go. */
async function pick(
  page: Page,
  dialog: "Formations" | "Defenses",
  name: string,
) {
  const browser = page.getByRole("dialog", { name: dialog });
  await expect(browser).toBeVisible();
  if (dialog === "Defenses") {
    const lined = browser.getByRole("button", { name: "With assignments" });
    if ((await lined.getAttribute("aria-pressed")) !== "true") {
      await lined.click();
    }
  }
  await browser.getByText(name, { exact: true }).click();
  await expect(browser).toBeHidden();
}

/**
 * The toast has gone and the pointer rests off the rail, so the screenshot
 * that follows is the same each run.
 */
async function settle(page: Page) {
  await page.mouse.move(0, 0);
  await expect(page.locator(".toast")).toBeHidden({ timeout: 10_000 });
}

test("an offensive play starts on its set, and the rail puts men on and takes them off", async ({
  page,
}, testInfo) => {
  await openBlankEditor(page);
  const tools = rail(page);
  const clearLines = tools.getByRole("button", { name: "Clear every line" });
  const clearPlayers = tools.getByRole("button", {
    name: "Clear every player",
  });
  const trash = tools.getByRole("button", { name: "Delete selection — ⌫" });

  // A new play opens on the Formations browser; closing it leaves the field
  // blank, and nothing on the rail has anything to take off.
  await newPlay(page, "offensive");
  const formations = page.getByRole("dialog", { name: "Formations" });
  await expect(formations).toBeVisible();
  await formations.getByTitle("Close — esc").click();
  await expect(formations).toBeHidden();
  await expect(men(page)).toHaveCount(0);
  await expect(clearLines).toBeDisabled();
  await expect(clearPlayers).toBeDisabled();
  await expect(trash).toBeDisabled();

  // The next new play is set from the browser it opens on.
  await newPlay(page, "offensive");
  await pick(page, "Formations", "Gun Trips Right");
  await expect(men(page)).toHaveCount(11);
  await expect(clearPlayers).toBeEnabled();

  // With no defense yet, the shadow button adds one…
  await tools
    .getByRole("button", { name: "Add a shadow defense — ⇧⌘D" })
    .click();
  await pick(page, "Defenses", "4-3 Cover 3");
  await expect(men(page)).toHaveCount(22);

  // …and then shows and hides it, which never takes it out of the play.
  const shadow = tools.getByRole("button", { name: "Shadow defense — H" });
  await expect(shadow).toHaveAttribute("aria-pressed", "true");
  await shadow.click();
  await expect(shadow).toHaveAttribute("aria-pressed", "false");
  await shadow.click();
  await expect(shadow).toHaveAttribute("aria-pressed", "true");
  await expect(men(page)).toHaveCount(22);

  // The Formation button changes the set the men stand in.
  await tools
    .getByRole("button", { name: "Add or change the formation — ⇧⌘F" })
    .click();
  await pick(page, "Formations", "Gun Doubles Right");
  await expect(
    page
      .getByRole("navigation", { name: "Sidebar" })
      .locator("[data-current-formation]"),
  ).toContainText("Gun Doubles Right");
  await expect(men(page)).toHaveCount(22);

  // The trash takes what is picked. A man is part of the eleven (ADR 0052),
  // so on him it takes what he was given: the Mike's drop, not the Mike.
  const drawn = await lines(page).count();
  expect(drawn).toBeGreaterThan(0);
  await expect(trash).toBeDisabled();
  await page.getByRole("img", { name: "M defense player" }).click();
  await expect(trash).toBeEnabled();
  await trash.click();
  await expect(lines(page)).toHaveCount(drawn - 1);
  await expect(men(page)).toHaveCount(22);
  await expect(trash).toBeDisabled();

  // Clear every line takes the rest of the drops and leaves every man.
  await clearLines.click();
  await expect(lines(page)).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    `Clear every line — ${drawn - 1} lines`,
  );
  await expect(clearLines).toBeDisabled();
  await expect(men(page)).toHaveCount(22);

  // Clear every player empties the field on both sides of the ball, and the
  // shadow button goes back to adding one.
  await clearPlayers.click();
  await expect(men(page)).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    "Clear every player — 22 men off",
  );
  await expect(clearPlayers).toBeDisabled();
  await expect(
    tools.getByRole("button", { name: "Add a shadow defense — ⇧⌘D" }),
  ).toBeVisible();

  // One undo puts every one of them back.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(men(page)).toHaveCount(22);
  await expect(shadow).toHaveAttribute("aria-pressed", "true");

  await settle(page);
  await page.screenshot({ path: testInfo.outputPath("offense-toolbar.png") });
  await tools.screenshot({ path: testInfo.outputPath("offense-rail.png") });
});

test("a defensive play starts on its call, and the rail adds its shadow offense", async ({
  page,
}, testInfo) => {
  await openBlankEditor(page);
  const tools = rail(page);

  await newPlay(page, "defensive");
  await pick(page, "Defenses", "4-3 Cover 3");
  await expect(men(page)).toHaveCount(11);

  // On a defensive play the rail's set is the call and its shadow is the
  // offense, each in its own browser.
  await expect(
    tools.getByRole("button", { name: "Add or change the formation — ⇧⌘F" }),
  ).toHaveCount(0);
  await tools
    .getByRole("button", { name: "Add a shadow offense — ⇧⌘F" })
    .click();
  await pick(page, "Formations", "Gun Doubles Right");
  await expect(men(page)).toHaveCount(22);
  await expect(
    tools.getByRole("button", { name: "Shadow offense — H" }),
  ).toHaveAttribute("aria-pressed", "true");

  await tools
    .getByRole("button", { name: "Add or change the defense — ⇧⌘D" })
    .click();
  await pick(page, "Defenses", "4-3 Cover 2");
  await expect(men(page)).toHaveCount(22);

  await settle(page);
  await page.screenshot({ path: testInfo.outputPath("defense-toolbar.png") });
  await tools.screenshot({ path: testInfo.outputPath("defense-rail.png") });
});
