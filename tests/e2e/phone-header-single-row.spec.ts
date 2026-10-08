import { chooseWorkspaceView, expect, headerCommand, test } from "./fixtures";

test.use({ hasTouch: true, isMobile: true });
test("keeps one row through portrait, destinations and rotation", async ({
  page,
}, info) => {
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const header = page.getByRole("banner");
    const name = header.getByRole("textbox", { name: "Play name" });
    await expect(name).toBeVisible();
    const originalName = await name.inputValue();
    const renamed = `A long play name stays on the row at ${viewport.width}`;
    const check = async () => {
      const rect = (await header.boundingBox())!;
      expect(rect.height).toBeLessThanOrEqual(56);
      const controls = await header
        .locator("button:visible, input:visible, select:visible")
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const { x, y, width, height } = node.getBoundingClientRect();
            return { x, y, width, height };
          }),
        );
      for (const control of controls) {
        expect(control.x).toBeGreaterThanOrEqual(0);
        expect(control.x + control.width).toBeLessThanOrEqual(viewport.width);
        expect(control.height).toBeGreaterThanOrEqual(44);
        expect(
          Math.abs(control.y + control.height / 2 - rect.y - rect.height / 2),
        ).toBeLessThanOrEqual(1);
      }
    };
    await check();
    await name.fill(renamed);
    await name.press("Enter");
    await check();
    await expect(await headerCommand(page, "Undo")).toBeEnabled();
    await (await headerCommand(page, "Undo")).click();
    await expect(name).toHaveValue(originalName);
    await (await headerCommand(page, "Redo")).click();
    await expect(name).toHaveValue(renamed);
    await (await headerCommand(page, "Play type")).click();
    await expect(
      page.getByRole("group", { name: "Play classification" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    for (const view of ["Playbooks", "Game Day", "Editor"] as const) {
      await chooseWorkspaceView(page, view);
      await check();
    }
    await page.screenshot({
      path: info.outputPath(`header-${viewport.width}.png`),
    });
  }
});
