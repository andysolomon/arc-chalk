import { type Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { addDefense, savedPlay } from "./defense-helpers";

/**
 * The selection's bar over the field is for a group (ADR 0052): two men or
 * more. One man picked, offense or defense, has his own sheet, and that is
 * where a lone defender's adjustments open — on him, with the rest of the
 * defense a choice away in the dialog. The sheet with his adjustments open
 * over it is the run's artifact.
 */
test.use({ viewport: { width: 390, height: 844 } });

const bar = (page: Page) =>
  page.getByRole("toolbar", { name: "Selected player actions" });

/** Where a man's stance is drawn, in client pixels. */
async function stance(page: Page, id: string) {
  return page.locator(`[data-scene-player="${id}"]`).evaluate((node) => {
    const matrix = (node as SVGGraphicsElement).getScreenCTM()!;
    const at = new DOMPoint(0, 0).matrixTransform(matrix);
    return { x: at.x, y: at.y };
  });
}

test("one defender picked has no bar over the field, and his sheet adjusts him", async ({
  page,
}, info) => {
  await page.goto("/");
  await addDefense(page);
  const play = await savedPlay(page);
  const free = play.players.find(
    (man) => man.unit === "defense" && man.label === "F",
  )!;
  expect(free).toBeDefined();

  // One defender: no bar over the field.
  const at = await stance(page, free.id);
  await page.touchscreen.tap(at.x, at.y);
  await expect(page.locator(`[data-scene-player="${free.id}"]`)).toHaveClass(
    /selected/,
  );
  await expect(bar(page)).toHaveCount(0);

  // One man on offense: no bar either, as it always was.
  const q = await stance(page, "q");
  await page.touchscreen.tap(q.x, q.y);
  await expect(page.locator('[data-scene-player="q"]')).toHaveClass(/selected/);
  await expect(bar(page)).toHaveCount(0);

  // Back to the defender — measured again, since the picked man's tray moves
  // the field — and his sheet opens his adjustments, on him alone.
  const again = await stance(page, free.id);
  await page.touchscreen.tap(again.x, again.y);
  await expect(page.locator(`[data-scene-player="${free.id}"]`)).toHaveClass(
    /selected/,
  );
  await page
    .getByRole("button", { name: "Show all assignments", exact: true })
    .tap();
  const sheet = page.locator('[data-sheet="full"]');
  await sheet
    .getByRole("button", { name: "Defensive adjustments", exact: true })
    .tap();
  const dialog = page.getByRole("dialog", {
    name: "Defensive adjustments",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("combobox", { name: "Adjustment scope", exact: true }),
  ).toHaveValue("selection");
  await page.screenshot({
    path: info.outputPath("phone-lone-defender-adjustments.png"),
  });

  // The rest of the defense is one choice away.
  await dialog
    .getByRole("combobox", { name: "Adjustment scope", exact: true })
    .selectOption("all");
  await expect(
    dialog.getByRole("combobox", { name: "Adjustment scope", exact: true }),
  ).toHaveValue("all");
});
