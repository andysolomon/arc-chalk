import type { PlayDocument } from "@chalk/domain";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * The Arrange menu on the selected men (ADR 0073): it is drawn as the
 * header's menus are, and it never leaves a formation the rules forbid. Lining
 * X, Y, Z and F up at the depth between them would put six backs behind the
 * line, so Align depth is greyed and says why; lining up all eleven would
 * stand the quarterback on the centre. Spacing X, Y and Z evenly is legal and
 * moves only Y. The menu open on the illegal pick is the run's artifact.
 */
test.use({ viewport: { width: 1440, height: 960 } });

async function selectPlayers(page: Page, ids: readonly string[]) {
  await page.keyboard.press("Escape");
  for (const [index, id] of ids.entries()) {
    const point = await page
      .locator(`[data-scene-player="${id}"]`)
      .evaluate((node) => {
        const matrix = (node as SVGGraphicsElement).getScreenCTM()!;
        const at = new DOMPoint(0, 0).matrixTransform(matrix);
        return { x: at.x, y: at.y };
      });
    if (index) await page.keyboard.down("Shift");
    await page.mouse.click(point.x, point.y);
    if (index) await page.keyboard.up("Shift");
  }
}

async function savedPlay(page: Page): Promise<PlayDocument> {
  const name = await page
    .getByRole("textbox", { name: "Play name" })
    .inputValue();
  return page.evaluate(
    (name) =>
      new Promise<PlayDocument>((resolve, reject) => {
        const open = indexedDB.open("chalk-production-beta");
        open.onerror = () =>
          reject(open.error ?? new Error("Could not open play database"));
        open.onsuccess = () => {
          const db = open.result;
          const read = db
            .transaction("plays", "readonly")
            .objectStore("plays")
            .getAll();
          read.onerror = () => {
            db.close();
            reject(read.error ?? new Error("Could not read play database"));
          };
          read.onsuccess = () => {
            db.close();
            const rows = read.result as Array<{ document: PlayDocument }>;
            const row = rows.find((row) => row.document.name === name);
            if (row) resolve(row.document);
            else reject(new Error("Play not saved"));
          };
        };
      }),
    name,
  );
}

const toolbar = (page: Page) =>
  page.getByRole("toolbar", { name: "Selected player actions" });

const lateral = (play: PlayDocument, id: string) =>
  play.players.find((man) => man.id === id)!.position.lateralYards;

test("Arrange looks like a menu and only offers legal rearrangements", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.locator('[data-scene-player="z"]')).toBeVisible();

  // Every man of the offense: Align depth would put Q where C stands.
  await selectPlayers(page, [
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
  ]);
  await expect(toolbar(page)).toContainText("11 players selected");
  const arrange = toolbar(page).getByRole("button", {
    name: "Arrange",
    exact: true,
  });
  await arrange.click();
  const menu = toolbar(page).getByRole("group", { name: "Arrange" });
  await expect(menu).toBeVisible();
  await expect(arrange).toHaveAttribute("aria-expanded", "true");
  const alignDepth = menu.getByRole("button", {
    name: "Align depth",
    exact: true,
  });
  await expect(alignDepth).toBeDisabled();
  await expect(alignDepth).toHaveAccessibleDescription("C and Q would overlap");
  // Escape folds it away again.
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  // X, Y, Z and F at one depth leave six backs.
  await selectPlayers(page, ["x", "y", "z", "f"]);
  await arrange.click();
  await expect(alignDepth).toBeDisabled();
  await expect(alignDepth).toHaveAccessibleDescription("Needs 7 on the line");
  await expect(page.locator('[data-line-status="illegal"]')).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("arrange-menu-illegal.png"),
  });

  // X, Y and Z spaced evenly is legal: only Y moves, to the middle.
  const before = await savedPlay(page);
  await selectPlayers(page, ["x", "y", "z"]);
  await arrange.click();
  await expect(alignDepth).toBeDisabled();
  await expect(alignDepth).toHaveAccessibleDescription("Already level");
  await menu.getByRole("button", { name: "Space evenly", exact: true }).click();
  await expect(menu).toBeHidden();
  await expect
    .poll(async () => {
      const after = await savedPlay(page);
      return lateral(after, "y") - lateral(before, "y");
    })
    .not.toBe(0);
  const after = await savedPlay(page);
  expect(lateral(after, "x")).toBeCloseTo(lateral(before, "x"), 6);
  expect(lateral(after, "z")).toBeCloseTo(lateral(before, "z"), 6);
  expect(lateral(after, "y") - lateral(after, "x")).toBeCloseTo(
    lateral(after, "z") - lateral(after, "y"),
    6,
  );
  await expect(page.locator(".line-count[data-line-count]")).toHaveCount(0);
});
