import { expect, test } from "./fixtures";

/**
 * The full sheet's head is its grip (product request 2026-10-12): the peek's
 * bar brings the sheet up, and a tap anywhere on the head that is not one of
 * its own buttons puts it back to its peek, on the roster and on a picked man
 * alike. The head's buttons still do their own work. The sheet before the tap
 * and the field after it, at each width, are the run's artifacts.
 */

for (const viewport of [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
]) {
  test.describe(`${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test("puts the sheet away from a tap on its head", async ({
      page,
    }, testInfo) => {
      await page.goto("/");
      await expect(page.locator(".chalk-shell.phone-workspace")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.locator("[data-scene-player]")).toHaveCount(11);
      const sheet = page.getByRole("complementary", { name: "Play inspector" });
      const head = sheet.locator(".sheet-head");
      const openSheet = async () => {
        await page.getByRole("button", { name: "Show all assignments" }).tap();
        await expect(sheet).toHaveAttribute("data-sheet", "full");
      };

      // The roster's head: its title is not a button, so it is the grip.
      await openSheet();
      await head.getByText("Assignments", { exact: true }).tap();
      await expect(sheet).toHaveAttribute("data-sheet", "peek");

      // A man picked out: his name in the middle of the head.
      await openSheet();
      await sheet.locator('[data-roster-player="q"]').tap();
      const back = sheet.getByRole("button", { name: /back to the roster/ });
      await expect(back).toBeVisible();
      await expect(head.locator(".sheet-title")).toContainText("Quarterback");
      await page.screenshot({
        path: testInfo.outputPath(`sheet-head-${viewport.width}.png`),
      });
      await head.locator(".sheet-title").tap();
      await expect(sheet).toHaveAttribute("data-sheet", "peek");

      // He stays picked: the sheet comes back up on him.
      await openSheet();
      await expect(back).toBeVisible();

      // The grab bar's strip along the top of the head is the grip too.
      const { width } = (await head.boundingBox())!;
      await head.tap({ position: { x: width / 2, y: 8 } });
      await expect(sheet).toHaveAttribute("data-sheet", "peek");

      // The head's own buttons still do their own work: the way back keeps
      // the sheet up, and Field puts it away.
      await openSheet();
      await back.tap();
      await expect(sheet).toHaveAttribute("data-sheet", "full");
      await expect(back).toHaveCount(0);
      await sheet.getByRole("button", { name: "Show the field" }).tap();
      await expect(sheet).toHaveAttribute("data-sheet", "peek");

      await page.screenshot({
        path: testInfo.outputPath(`sheet-put-away-${viewport.width}.png`),
      });
    });
  });
}
