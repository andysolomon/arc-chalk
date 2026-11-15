import { expect, test } from "./fixtures";

/**
 * Every edit is saved as it is made, so the header offers Versions, not a
 * Save that only flashed "Saved" (ADR 0084).
 */
test("the header offers Versions, and nothing in it pretends to save", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const header = page.getByRole("banner");
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();

  await expect(
    header.getByRole("button", { name: "Save", exact: true }),
  ).toHaveCount(0);

  // ⌘S still opens the menu; it holds only what makes something new.
  await page.keyboard.press("ControlOrMeta+s");
  const panel = page.locator(".menu-versions .menu-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: /^Save ⌘S/ })).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Save as variant", exact: true }),
  ).toBeVisible();

  await panel.getByRole("button", { name: "Snapshot", exact: true }).click();
  await panel
    .getByRole("textbox", { name: "Snapshot name" })
    .fill("Install week");
  await panel.getByRole("button", { name: "Snapshot", exact: true }).click();
  await expect(panel.getByText("Install week")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Restore" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  // The palette has no Save command either.
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette
    .getByPlaceholder("Type a command — formation, defense, export, clear…")
    .fill("save play");
  await expect(palette.getByRole("button", { name: "Save play" })).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");

  await header.getByRole("button", { name: "Versions", exact: true }).click();
  await expect(panel.getByText("Install week")).toBeVisible();
  const viewport = page.viewportSize()!;
  await page.screenshot({
    animations: "disabled",
    caret: "hide",
    clip: { x: viewport.width - 520, y: 0, width: 520, height: 280 },
    path: testInfo.outputPath("versions-menu.png"),
  });
});
