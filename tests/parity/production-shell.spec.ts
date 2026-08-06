import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 4 has to answer one question with evidence: does the production shell
 * look like the original a Coach already knows? These tests capture production
 * and compare it against the *original's* golden, so the number below is the
 * live parity gap rather than an opinion.
 *
 * Each threshold is a ratchet. It records the gap measured when the state was
 * last worked on and may only ever be lowered. Raising one is a parity
 * regression and needs the product owner's approval per ADR 0039.
 */
const parityGap: Readonly<Record<string, number>> = {
  // Measured 1.85% (25,526 px) on 2026-08-06, down from 2.14%. Remaining:
  // the field renders from a different viewBox aspect than the original's, so
  // the Play sits a few pixels off; tool-rail glyph shapes still differ; and
  // the status bar's spacing does not match.
  editor: 0.0185,
  // The five chrome overlays, first measured on 2026-08-06. Each sits at or
  // just under the Editor's own gap because the panel covers part of the field
  // it disagrees about — what is left is the shell behind them, not the
  // overlay. Their item lists, ordering and copy already match the original.
  moreMenu: 0.0182,
  exportMenu: 0.0175,
  saveMenu: 0.0182,
  commandPalette: 0.018,
  // Higher than the rest for one reason: reaching "Shortcuts ?" scrolls the
  // inspector, and the original's inspector carries History, Page and Type
  // sections production has not built. The panel itself matches — its rows and
  // wrapped rows measure the original's 28 px and 62 px exactly.
  shortcuts: 0.0264,
};

/**
 * The original goldens were captured on macOS. Chromium rasterizes text
 * slightly differently on GitHub's Linux runners, and the canonical harness
 * already allows that delta, so CI measures the parity gap on top of it rather
 * than mistaking antialiasing for a regression.
 */
const CI_RASTERIZATION_DELTA = 0.02;

const allowedGap = (state: keyof typeof parityGap): number =>
  parityGap[state]! + (process.env.CI ? CI_RASTERIZATION_DELTA : 0);

const loadProductionShell = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    indexedDB.deleteDatabase("chalk-production-beta");
  });

  await page.goto("/");
  await expect(page).toHaveTitle("Chalk");
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Stick — Thunder",
  );
  await page.evaluate(async () => document.fonts.ready);
};

test.describe("production shell against the canonical original", () => {
  test("Editor matches the original desktop golden", async ({ page }) => {
    await loadProductionShell(page);

    await expect(page).toHaveScreenshot(
      "original-editor-desktop-1440x960.png",
      {
        animations: "disabled",
        caret: "hide",
        fullPage: true,
        maxDiffPixelRatio: allowedGap("editor"),
      },
    );
  });
});

/**
 * The overlay states are driven through the same affordances the original's
 * own capture uses, so a state that production cannot reach fails here rather
 * than quietly comparing a different screen.
 */
test.describe("production editor overlays against the canonical original", () => {
  test.beforeEach(async ({ page }) => {
    await loadProductionShell(page);
  });

  test("More menu matches the original", async ({ page }) => {
    await page.getByTitle("More actions").click();
    await expect(page.getByText("Focus mode", { exact: true })).toBeVisible();

    await expect(page).toHaveScreenshot(
      "original-editor-more-menu-desktop-1440x960.png",
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: allowedGap("moreMenu"),
      },
    );
  });

  test("Export menu matches the original", async ({ page }) => {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(page.getByText("DIAGRAM", { exact: true })).toBeVisible();

    await expect(page).toHaveScreenshot(
      "original-editor-export-menu-desktop-1440x960.png",
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: allowedGap("exportMenu"),
      },
    );
  });

  test("Save and version menu matches the original", async ({ page }) => {
    await page.keyboard.press("Control+s");
    await expect(
      page.getByRole("button", { name: "Save as variant", exact: true }),
    ).toBeVisible();

    await expect(page).toHaveScreenshot(
      "original-editor-save-menu-desktop-1440x960.png",
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: allowedGap("saveMenu"),
      },
    );
  });

  test("command palette matches the original", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await expect(
      page.getByPlaceholder(
        "Type a command — formation, defense, export, clear…",
      ),
    ).toBeVisible();

    await expect(page).toHaveScreenshot(
      "original-editor-command-palette-desktop-1440x960.png",
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: allowedGap("commandPalette"),
      },
    );
  });

  test("shortcut reference matches the original", async ({ page }) => {
    await page
      .getByRole("button", { name: "Shortcuts ?", exact: true })
      .click();
    await expect(
      page.getByText("Keyboard shortcuts", { exact: true }),
    ).toBeVisible();

    await expect(page).toHaveScreenshot(
      "original-editor-shortcuts-desktop-1440x960.png",
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: allowedGap("shortcuts"),
      },
    );
  });
});
