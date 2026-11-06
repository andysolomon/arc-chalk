import {
  chooseWorkspaceView,
  closePlayName,
  expect,
  headerCommand,
  playNameField,
  test,
} from "./fixtures";

test.use({ hasTouch: true, isMobile: true });
test("keeps one row through portrait, destinations and rotation", async ({
  page,
}, info) => {
  // Four sizes, each renaming through the drawer.
  test.setTimeout(90_000);
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const header = page.getByRole("banner");
    // The row names no play; the drawer does.
    await expect(
      header.getByRole("button", { name: "New play", exact: true }),
    ).toBeVisible();
    await expect(
      header.getByRole("textbox", { name: "Play name" }),
    ).toHaveCount(0);
    const name = await playNameField(page);
    const originalName = await name.inputValue();
    await closePlayName(page);
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
    await (await playNameField(page)).fill(renamed);
    await (await playNameField(page)).press("Enter");
    await closePlayName(page);
    await check();
    await expect(await headerCommand(page, "Undo")).toBeEnabled();
    await (await headerCommand(page, "Undo")).click();
    await expect(await playNameField(page)).toHaveValue(originalName);
    await closePlayName(page);
    await (await headerCommand(page, "Redo")).click();
    await expect(await playNameField(page)).toHaveValue(renamed);
    await closePlayName(page);
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
