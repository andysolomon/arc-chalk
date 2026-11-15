import { type Locator, type Page } from "@playwright/test";
import { expect, openSeededEditor, test } from "./fixtures";

/**
 * Cover 1 over a two-by-two set (#196, ADR 0060): 4-3 Cover 3's men put in
 * man one at a time, with the free safety left deep in the middle, against
 * Gun Doubles Right. Each man in man takes the receiver on his side of the
 * ball — the $ the tight end, the Will the slot across from him, the Mike
 * the back — and the man left over is the Sam, in the hole, rather than a $
 * sent across the formation past a free Will. The field is saved at a fixed
 * size as the run's artifact.
 */

/** Every man call on the field, as the field names it: "C man on Z". */
async function manCalls(page: Page): Promise<string[]> {
  const labels = await page
    .locator('[data-scene-path-group][aria-label*=" man"]')
    .evaluateAll((groups) =>
      groups.map((group) => group.getAttribute("aria-label") ?? ""),
    );
  return labels.sort();
}

const defender = (page: Page, label: string) =>
  page.locator(`[aria-label="${label} defense player"]`);

/** Selects a defender and presses Man in his Quick assignments. */
async function giveMan(page: Page, man: Locator): Promise<void> {
  await man.click({ force: true });
  await expect(page.locator(".player-heading")).toBeVisible();
  const button = page
    .locator(".section-heading", { hasText: "Quick assignments" })
    .locator("xpath=following-sibling::div[1]")
    .getByRole("button", { name: "Man", exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

test("matches each man in Cover 1 to the receiver on his side of the ball over Gun Doubles Right", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await openSeededEditor(page);

  // 4-3 Cover 3, with its drops: the free safety deep in the middle is the
  // one deep man behind the others once they are in man.
  await page.keyboard.press("Control+Shift+d");
  const defenses = page.getByRole("dialog", { name: "Defenses" });
  await expect(defenses).toBeVisible();
  const withLines = defenses.getByRole("button", { name: "With assignments" });
  if ((await withLines.getAttribute("aria-pressed")) !== "true") {
    await withLines.click();
  }
  await defenses
    .getByRole("textbox", { name: "Search defenses" })
    .fill("4-3 Cover 3");
  await defenses.getByText("4-3 Cover 3", { exact: true }).click();
  await expect(defenses).toBeHidden();

  for (const man of [
    defender(page, "C").first(),
    defender(page, "C").last(),
    defender(page, "$"),
    defender(page, "W"),
    defender(page, "M"),
    defender(page, "S"),
  ]) {
    await giveMan(page, man);
  }
  await expect(page.locator("[data-coverage-scheme]")).toHaveAttribute(
    "data-coverage-scheme",
    "Cover 1",
  );

  // A new set, and the whole defense in man is matched against it at once.
  await page.keyboard.press("Control+Shift+f");
  const formations = page.getByRole("dialog", { name: "Formations" });
  await expect(formations).toBeVisible();
  await formations.getByText("Gun Doubles Right").click();
  await expect(formations).toBeHidden();

  await expect
    .poll(() => manCalls(page))
    .toEqual([
      "$ man on Y",
      "C man on X",
      "C man on Z",
      "M man on F",
      "S man",
      "W man on H",
    ]);

  await page.keyboard.press("Escape");
  await page
    .locator("svg.field-diagram")
    .first()
    .screenshot({ path: testInfo.outputPath("cover-1-over-doubles.png") });
});
