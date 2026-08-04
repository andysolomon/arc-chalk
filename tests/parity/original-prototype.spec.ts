import { expect, test, type Page } from "@playwright/test";

const loadCanonicalPrototype = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });

  await page.goto("/");
  await expect(page).toHaveTitle("Stick — Thunder — Chalk", {
    timeout: 30_000,
  });
  await expect(page.locator('input[value="Stick — Thunder"]')).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
};

const captureMode = async (
  page: Page,
  mode: "Editor" | "Demo" | "Present" | "Print",
): Promise<void> => {
  const modeButton = page
    .getByRole("button", { name: mode, exact: true })
    .first();

  if (mode !== "Editor") {
    await modeButton.click();
  }

  if (mode === "Demo") {
    await page.getByRole("button", { name: "Pause", exact: true }).click();
  }

  await expect(modeButton).toBeVisible();
  await expect(page).toHaveScreenshot(
    `original-${mode.toLowerCase()}-desktop-1440x960.png`,
    {
      animations: "disabled",
      caret: "hide",
      fullPage: true,
    },
  );
};

test.describe("canonical prototype top-level modes", () => {
  for (const mode of ["Editor", "Demo", "Present", "Print"] as const) {
    test(`${mode} has a locked desktop golden`, async ({ page }) => {
      await loadCanonicalPrototype(page);
      await captureMode(page, mode);
    });
  }
});
