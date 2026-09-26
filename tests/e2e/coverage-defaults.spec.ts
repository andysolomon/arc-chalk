import { type Locator, type Page } from "@playwright/test";
import { expect, openSeededEditor, test } from "./fixtures";

/**
 * Coverage defaults (ADR 0061), the way a Coach sets them: how far off the
 * ball his corners and deep safeties play, once in Settings, and every call
 * he puts on stands them there — in Cover 0 the men in man then line up on
 * their receivers at that depth. The field under each setting is the run's
 * artifact.
 */

/** Puts a call's defenders on the field with its lines. */
async function putOnDefense(page: Page, name: string): Promise<void> {
  await page.keyboard.press("Control+Shift+d");
  const browser = page.getByRole("dialog", { name: "Defenses" });
  await expect(browser).toBeVisible();
  const toggle = browser.getByRole("button", { name: "With assignments" });
  if ((await toggle.getAttribute("aria-pressed")) !== "true") {
    await toggle.click();
  }
  await browser.getByRole("textbox").fill(name);
  await browser.getByText(name, { exact: true }).click();
  await expect(browser).toBeHidden();
  await expect(page.locator("[data-scene-player]")).toHaveCount(22);
}

/** Sets the Playbook's coverage defaults in Settings. */
async function setDepths(
  page: Page,
  corners: string,
  safeties: string,
): Promise<void> {
  await page
    .getByRole("banner")
    .getByRole("button", { name: "More actions" })
    .click();
  await page.getByRole("button", { name: "Settings…" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("tab", { name: "Playbook" }).click();
  const group = settings.getByRole("group", { name: "Coverage defaults" });
  const cornerSelect = group.getByRole("combobox", {
    name: "Corners off the ball",
  });
  const safetySelect = group.getByRole("combobox", {
    name: "Deep safeties off the ball",
  });
  await cornerSelect.selectOption({ label: corners });
  await expect(cornerSelect.locator("option:checked")).toHaveText(corners);
  await safetySelect.selectOption({ label: safeties });
  await expect(safetySelect.locator("option:checked")).toHaveText(safeties);
  await settings.getByRole("button", { name: "Close" }).click();
  await expect(settings).toHaveCount(0);
}

const defender = (page: Page, label: string) =>
  page.locator(`[aria-label="${label} defense player"]`);

async function yOf(locator: Locator): Promise<number> {
  const transform = (await locator.getAttribute("transform")) ?? "";
  const [, , y] = /translate\(([-\d.]+)[ ,]+([-\d.]+)/.exec(transform) ?? [];
  return Number(y);
}

/**
 * How far off the ball each man lettered `label` stands, in yards, read
 * against two men the call always stands at the same depths: an end at
 * 2⅙ yards and a linebacker lettered `backer` at `backerYards`.
 */
async function yardsOff(
  page: Page,
  label: string,
  backer: string,
  backerYards: number,
): Promise<number[]> {
  const endYards = 26 / 12;
  const end = await yOf(defender(page, "E").first());
  const perYard =
    (end - (await yOf(defender(page, backer)))) / (backerYards - endYards);
  const depths: number[] = [];
  for (const man of await defender(page, label).all()) {
    depths.push(endYards + (end - (await yOf(man))) / perYard);
  }
  return depths;
}

async function saveField(page: Page, path: string): Promise<void> {
  await page.locator("svg.field-diagram").first().screenshot({ path });
}

test("stands corners and deep safeties at the Coach's depths in every call he puts on", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);

  // Press corners and a safety fourteen deep.
  await setDepths(page, "Press — 1 yard", "14 yards");
  await putOnDefense(page, "4-3 Cover 3");
  // The Mike stands 7⅔ yards off in 4-3 Cover 3 whatever the settings say.
  for (const depth of await yardsOff(page, "C", "M", 92 / 12)) {
    expect(depth).toBeCloseTo(1, 1);
  }
  // Both safeties drop deep in this call.
  for (const label of ["F", "$"]) {
    const [safety] = await yardsOff(page, label, "M", 92 / 12);
    expect(safety).toBeCloseTo(14, 1);
  }
  await saveField(page, testInfo.outputPath("1-cover-3-press-and-14.png"));

  // In Nickel Cover 1 the free safety is deep and takes the setting; the
  // other safety is in man underneath and keeps the call's spot, as do the
  // corners — the call has help deep, so nobody in man is moved.
  await putOnDefense(page, "Nickel Cover 1");
  const [free] = await yardsOff(page, "F", "W", 86 / 12);
  expect(free).toBeCloseTo(14, 1);
  const [down] = await yardsOff(page, "$", "W", 86 / 12);
  expect(down).toBeCloseTo(112 / 12, 1);
  for (const depth of await yardsOff(page, "C", "W", 86 / 12)) {
    expect(depth).toBeCloseTo(1, 1);
  }

  // In Cover 0 the pressed corners line up on their men at that depth.
  await putOnDefense(page, "Bear Front Cover 0");
  // The Will stands 7 yards off in the Bear before he blitzes.
  for (const depth of await yardsOff(page, "C", "W", 84 / 12)) {
    expect(depth).toBeCloseTo(1, 1);
  }
  await saveField(page, testInfo.outputPath("2-bear-cover-0-pressed.png"));

  // Back to the calls as drawn.
  await setDepths(page, "As the call draws it", "As the call draws it");
  await putOnDefense(page, "4-3 Cover 3");
  for (const depth of await yardsOff(page, "C", "M", 92 / 12)) {
    expect(depth).toBeCloseTo(58 / 12, 1);
  }
  const [drawn] = await yardsOff(page, "F", "M", 92 / 12);
  expect(drawn).toBeCloseTo(234 / 12, 1);
  await saveField(page, testInfo.outputPath("3-cover-3-as-drawn.png"));
});
