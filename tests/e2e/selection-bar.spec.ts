import { type Page } from "@playwright/test";

import { expect, openSeededEditor, test } from "./fixtures";
import { addDefense, savedPlay, selectPlayers } from "./defense-helpers";

/**
 * The selection's bar over the field is for a group: two men or more. A lone
 * defender's adjustments open from his own panel in the inspector, on him;
 * two defenders get the bar, with Adjust defense and Arrange. The field with
 * the pair's bar over it is the run's artifact.
 */

const bar = (page: Page) =>
  page.getByRole("toolbar", { name: "Selected player actions" });

test("one defender adjusts from his panel; two get the bar", async ({
  page,
}, info) => {
  await openSeededEditor(page);
  await addDefense(page);
  const play = await savedPlay(page);
  const corners = play.players.filter(
    (man) => man.unit === "defense" && man.label === "C",
  );
  expect(corners).toHaveLength(2);

  // One defender: no bar, and his panel's adjustments open on him.
  await selectPlayers(page, [corners[0]!.id]);
  await expect(
    page.locator(`[data-scene-player="${corners[0]!.id}"]`),
  ).toHaveClass(/selected/);
  await expect(bar(page)).toHaveCount(0);
  await page
    .getByRole("complementary", { name: "Play inspector" })
    .getByRole("button", { name: "Defensive adjustments", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Defensive adjustments",
    exact: true,
  });
  await expect(
    dialog.getByRole("combobox", { name: "Adjustment scope", exact: true }),
  ).toHaveValue("selection");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog).toBeHidden();

  // Nobody picked: the same row is the whole defense's.
  await page.keyboard.press("Escape");
  await page
    .getByRole("complementary", { name: "Play inspector" })
    .getByRole("button", { name: "Defensive adjustments", exact: true })
    .click();
  await expect(
    dialog.getByRole("combobox", { name: "Adjustment scope", exact: true }),
  ).toHaveValue("all");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();

  // Two defenders: the bar, with Adjust defense and Arrange.
  await selectPlayers(
    page,
    corners.map(({ id }) => id),
  );
  await expect(bar(page)).toContainText("2 players selected");
  await expect(
    bar(page).getByRole("button", { name: "Adjust defense", exact: true }),
  ).toBeVisible();
  await expect(
    bar(page).getByRole("button", { name: /^Arrange/ }),
  ).toBeVisible();

  await page.mouse.move(0, 0);
  await expect(page.locator(".toast")).toBeHidden({ timeout: 10_000 });
  await page.screenshot({ path: info.outputPath("two-defenders-bar.png") });
});
