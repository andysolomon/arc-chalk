import { closeNewPlayBrowser, expect, openBlankEditor, test } from "./fixtures";

for (const touch of [false, true]) {
  for (const width of [668, 694, 768, 820, 834, 1024, 1180, 1240, 1366]) {
    test.describe(`${touch ? "touch" : "mouse"} single-row header at ${width}`, () => {
      test.use({
        viewport: { width, height: 1194 },
        hasTouch: touch,
        isMobile: touch,
      });
      test("keeps the editor and destination headers on one row", async ({
        page,
      }, info) => {
        await page.goto("/");
        const header = page.getByRole("banner");
        const name = header.getByRole("textbox", { name: "Play name" });
        await expect(name).toHaveValue("Stick — Thunder");
        await name.fill(
          "A very long play name that must never push Save onto another row",
        );
        await name.press("Enter");
        const check = async () => {
          const rect = await header.boundingBox();
          expect(rect!.height).toBeLessThanOrEqual(60);
          const boxes = await header
            .locator("button:visible, input:visible, select:visible")
            .evaluateAll((nodes) =>
              nodes.map((node) => {
                const { x, y, width, height } = node.getBoundingClientRect();
                return { x, y, width, height };
              }),
            );
          for (const box of boxes) {
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
            expect(box.height).toBeGreaterThanOrEqual(touch ? 44 : 26);
            expect(
              Math.abs(box.y + box.height / 2 - (rect!.y + rect!.height / 2)),
            ).toBeLessThanOrEqual(1);
          }
          for (let i = 1; i < boxes.length; i++) {
            expect(boxes[i]!.x).toBeGreaterThanOrEqual(
              boxes[i - 1]!.x + boxes[i - 1]!.width - 1,
            );
          }
        };
        await check();
        await page.screenshot({
          path: info.outputPath("editor-single-row.png"),
        });
        for (const view of ["Playbooks", "Game Day", "Editor"]) {
          await header.getByRole("button", { name: view, exact: true }).click();
          await check();
        }
        await page.screenshot({
          path: info.outputPath("returned-editor-single-row.png"),
        });
      });
    });
  }
}

test.describe("iPad portrait overflow actions", () => {
  test.use({
    viewport: { width: 834, height: 1194 },
    hasTouch: true,
    isMobile: true,
  });
  test("keeps New play, Present, Print and Save usable in both themes", async ({
    page,
  }, info) => {
    await openBlankEditor(page);
    const header = page.getByRole("banner");
    const more = page.locator(".more-panel");
    const openMore = () =>
      header.getByRole("button", { name: "More actions", exact: true }).click();
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => {
        localStorage.setItem("chalk.theme", theme);
        window.dispatchEvent(new Event("chalk-theme-change"));
      }, theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.screenshot({
        path: info.outputPath(`ipad-portrait-${theme}.png`),
      });
      await openMore();
      await expect(
        more.getByRole("button", { name: "Reset positions", exact: true }),
      ).toBeDisabled();
      await more
        .getByRole("button", { name: "New defensive play", exact: true })
        .click();
      await expect(
        header.getByRole("button", { name: "Play type", exact: true }),
      ).toContainText("Defense");
      await closeNewPlayBrowser(page, "defensive");
      await openMore();
      await more.getByRole("button", { name: "Present", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "Present", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await openMore();
      await more
        .getByRole("button", { name: "Print & export", exact: true })
        .click();
      await expect(
        page.getByRole("region", { name: "Print & export" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await header.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.locator(".menu-save .menu-panel")).toBeVisible();
      await page.keyboard.press("Escape");
      await openMore();
      await more
        .getByRole("button", { name: "New offensive play", exact: true })
        .click();
      await expect(
        header.getByRole("button", { name: "Play type", exact: true }),
      ).toContainText("Offense");
      await closeNewPlayBrowser(page, "offensive");
    }
    await page.screenshot({
      path: info.outputPath("ipad-portrait-dark-final.png"),
    });
  });
});
