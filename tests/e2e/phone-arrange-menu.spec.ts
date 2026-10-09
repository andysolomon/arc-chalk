import { expect, openBlankEditor, test } from "./fixtures";

/**
 * The Arrange menu on a phone (ADR 0073). With all eleven of Gun Doubles
 * picked, it opens as the header's menus do — a panel of quiet rows a finger
 * wide, on the glass — and Align depth is greyed with the reason, since one
 * depth for all eleven would stand men on one another. Space evenly is legal
 * and leaves the formation legal. The phone with the menu open is the run's
 * artifact.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("a phone's Arrange menu fits the app and refuses an illegal set", async ({
  page,
}, testInfo) => {
  await openBlankEditor(page);
  await page.getByRole("button", { name: "More actions", exact: true }).tap();
  await page
    .locator(".more-panel")
    .getByRole("button", { name: /^New offensive play/ })
    .tap();
  const browser = page.getByRole("dialog", { name: "Formations" });
  await browser.getByText("Gun Doubles Right", { exact: true }).tap();
  await expect(browser).toBeHidden();
  const men = page.locator("[data-scene-player]");
  await expect(men).toHaveCount(11);

  await page.keyboard.press("ControlOrMeta+a");
  const toolbar = page.getByRole("toolbar", {
    name: "Selected player actions",
  });
  await expect(toolbar).toContainText("11 players selected");
  const arrange = toolbar.getByRole("button", { name: "Arrange", exact: true });
  await arrange.tap();
  const menu = toolbar.getByRole("group", { name: "Arrange" });
  await expect(menu).toBeVisible();

  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  for (const name of ["Group", "Ungroup", "Align depth", "Space evenly"]) {
    const item = menu.getByRole("button", { name, exact: true });
    expect((await item.boundingBox())!.height, name).toBeGreaterThanOrEqual(44);
    // A menu row, not a boxed button: no border of its own.
    expect(
      await item.evaluate((node) => getComputedStyle(node).borderTopWidth),
      name,
    ).toBe("0px");
  }

  const alignDepth = menu.getByRole("button", {
    name: "Align depth",
    exact: true,
  });
  await expect(alignDepth).toBeDisabled();
  await expect(alignDepth).toHaveAccessibleDescription(/ would overlap$/);
  await expect(menu.getByText(/ would overlap$/)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("phone-arrange-menu.png"),
  });

  const before = await men.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("transform")),
  );
  await menu.getByRole("button", { name: "Space evenly", exact: true }).tap();
  await expect(menu).toBeHidden();
  await expect
    .poll(() =>
      men.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("transform")),
      ),
    )
    .not.toEqual(before);
  await expect(
    page.locator('.line-count[data-line-count="illegal"]'),
  ).toHaveCount(0);
});
