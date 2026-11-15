import { type Page } from "@playwright/test";

import { expect, openSeededEditor, test } from "./fixtures";
import { savedPlay, selectPlayers } from "./defense-helpers";

/**
 * A Group picks every member on one click, so the bar over the field says
 * it is a Group and puts Ungroup on its face. Without that, a Coach who
 * tied all eleven together by mistake has eleven men lighting up on every
 * click and no hint why. The grouped team's bar and the man tied to his
 * own line are the run's artifacts.
 */
test.use({ viewport: { width: 1440, height: 960 } });

const OFFENSE = [
  "ol0",
  "ol1",
  "ol2",
  "ol3",
  "ol4",
  "q",
  "x",
  "f",
  "h",
  "y",
  "z",
];

const bar = (page: Page) =>
  page.getByRole("toolbar", { name: "Selected player actions" });

const selectedMen = (page: Page) =>
  page.locator("[data-scene-player].selected");

async function shiftClickLine(page: Page, pathId: string): Promise<void> {
  const at = await page.evaluate((pathId) => {
    const path = document
      .querySelector(`[data-scene-path-group="${pathId}"]`)
      ?.querySelector<SVGPathElement>("path");
    const matrix = path?.getScreenCTM();
    if (!path || !matrix) throw new Error(`${pathId} is not on the field.`);
    const point = path.getPointAtLength(path.getTotalLength() * 0.5);
    const onGlass = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: onGlass.x, y: onGlass.y };
  }, pathId);
  await page.keyboard.down("Shift");
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up("Shift");
}

const groupsOf = async (page: Page) => {
  const play = await savedPlay(page);
  return [...play.players, ...play.paths].flatMap(({ group }) =>
    group ? [group] : [],
  );
};

test("a Group says so on the bar, and Ungroup is one click away", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);

  // Tie the whole offense together, the way Arrange offers it.
  await selectPlayers(page, OFFENSE);
  await expect(bar(page)).toContainText("11 players selected");
  await bar(page)
    .getByRole("button", { name: /^Arrange/ })
    .click();
  await bar(page)
    .getByRole("group", { name: "Arrange" })
    .getByRole("button", { name: "Group", exact: true })
    .click();
  await expect.poll(async () => (await groupsOf(page)).length).toBe(11);

  // One click on one man picks all eleven, and the bar says why.
  await selectPlayers(page, ["x"]);
  await expect(selectedMen(page)).toHaveCount(11);
  await expect(
    bar(page).getByText("Group · 11 players", { exact: true }),
  ).toBeVisible();
  const ungroup = bar(page).getByRole("button", {
    name: "Ungroup",
    exact: true,
  });
  await expect(ungroup).toBeVisible();
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: testInfo.outputPath("group-bar-eleven.png"),
  });

  // Ungroup unties them; the eleven stay picked but are men again.
  await ungroup.click();
  await expect.poll(async () => (await groupsOf(page)).length).toBe(0);
  await expect(bar(page)).toContainText("11 players selected");
  await expect(ungroup).toHaveCount(0);
  await selectPlayers(page, ["x"]);
  await expect(selectedMen(page)).toHaveCount(1);
  await expect(bar(page)).toHaveCount(0);

  // A man tied to his own line is a Group too, and gets the bar for it,
  // though a line in the pick would otherwise keep the bar away.
  await shiftClickLine(page, "rx");
  await page.keyboard.press("Control+g");
  await expect.poll(async () => (await groupsOf(page)).length).toBe(2);
  await selectPlayers(page, ["x"]);
  await expect(
    bar(page).getByText("Group · 1 player · 1 line", { exact: true }),
  ).toBeVisible();
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: testInfo.outputPath("group-bar-man-and-line.png"),
  });
  await ungroup.click();
  await expect.poll(async () => (await groupsOf(page)).length).toBe(0);
});
