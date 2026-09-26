import { expect, openSeededEditor, test } from "./fixtures";

/**
 * Dark on a phone (ADR 0061): Settings is a page with pill tabs, and
 * Appearance is one of them. Picking Dark turns the header, the tools and
 * the assignments sheet dark around a field that stays white paper. The test
 * ends with a screenshot of the editor in the dark.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("picks Dark from the Settings page and keeps the field on paper", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openSeededEditor(page);
  await expect(page.locator("header.topbar.phone-topbar")).toBeVisible();

  await page.getByRole("button", { name: "More actions" }).tap();
  await page.getByRole("button", { name: "Settings…" }).tap();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("tab", { name: "Appearance" }).tap();
  await settings
    .getByRole("group", { name: "Theme" })
    .getByRole("button", { name: "Dark" })
    .tap();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await settings.getByRole("button", { name: "Close" }).tap();
  await expect(settings).toHaveCount(0);

  const color = (selector: string, property: "backgroundColor" | "fill") =>
    page
      .locator(selector)
      .first()
      .evaluate((node, name) => getComputedStyle(node)[name], property);
  expect(await color("header.topbar", "backgroundColor")).toBe(
    "rgb(17, 17, 17)",
  );
  expect(await color(".field-paper", "fill")).toBe("rgb(255, 255, 255)");

  await page.screenshot({ path: testInfo.outputPath("phone-editor-dark.png") });
});
