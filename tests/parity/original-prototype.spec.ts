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
      // The original Demo runtime advances its hand-drawn cursor on requestAnimationFrame
      // even after Pause. Keep the golden strict everywhere else while tolerating its
      // tiny antialiasing shimmer (well under 0.01% of this viewport).
      maxDiffPixels: mode === "Demo" ? 50 : 0,
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

test.describe("canonical prototype editor overlays", () => {
  test.beforeEach(async ({ page }) => {
    await loadCanonicalPrototype(page);
  });

  test("More menu has a locked desktop golden", async ({ page }) => {
    await page.getByTitle("More actions").click();
    await expect(page.getByText("Focus mode", { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot(
      "original-editor-more-menu-desktop-1440x960.png",
    );
  });

  test("Export menu has a locked desktop golden", async ({ page }) => {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(page.getByText("DIAGRAM", { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot(
      "original-editor-export-menu-desktop-1440x960.png",
    );
  });

  test("Save and version menu has a locked desktop golden", async ({
    page,
  }) => {
    await page.keyboard.press("Control+s");
    await expect(
      page.getByRole("button", { name: "Save as variant", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      "original-editor-save-menu-desktop-1440x960.png",
    );
  });

  test("command palette has a locked desktop golden", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await expect(
      page.getByPlaceholder(
        "Type a command — formation, defense, export, clear…",
      ),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      "original-editor-command-palette-desktop-1440x960.png",
      { caret: "hide" },
    );
  });

  test("shortcut reference has a locked desktop golden", async ({ page }) => {
    await page
      .getByRole("button", { name: "Shortcuts ?", exact: true })
      .click();
    await expect(
      page.getByText("Keyboard shortcuts", { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      "original-editor-shortcuts-desktop-1440x960.png",
    );
  });

  test("Formation browser has a locked desktop golden", async ({ page }) => {
    await page.getByTitle("Browse formations — ⇧⌘F").click();
    await expect(
      page.getByPlaceholder("Search — gun, trips, empty, 12…"),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      "original-editor-formations-desktop-1440x960.png",
      { caret: "hide" },
    );
  });

  test("Defense browser has a locked desktop golden", async ({ page }) => {
    await page.getByTitle("Browse defenses — ⇧⌘D").click();
    await expect(
      page.getByPlaceholder("Search — cover 3, nickel, blitz…"),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      "original-editor-defenses-desktop-1440x960.png",
      { caret: "hide" },
    );
  });
});
