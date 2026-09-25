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
/**
 * Raised once, on 2026-08-08, under the corrected-expectation rule in
 * `docs/original-prototype-parity-matrix.md` rather than as a regression.
 *
 * The original reads crossfield distance on the depth scale, so its Plays are
 * drawn half again too wide — review finding #3, recorded as a defect the
 * production app must not reproduce. That defect had been carried into the
 * seeded Play's yard coordinates, where a compensating stretch in the renderer
 * hid it: the split end stood five yards out of bounds and was drawn inside a
 * sideline that was itself 177 px too far out. Correcting both moves every
 * Player about 1.3% and costs a little against goldens captured from the
 * uncorrected original.
 *
 * Matching the original's buggy yards would be bug-compatibility, not parity.
 * The field is now drawn in the original's own 1000×620 frame, at the original's
 * own scales, with correct yards. Tool-rail glyphs below Text (Clear, Snap,
 * collapse) measure the original's own 18×18 at x 19 and 40×22 collapse.
 * What remains of the Editor gap is Finding #3's 1.3% Player shift.
 *
 * Formations and Defenses ticked up 317 px on 2026-08-21 when the field filled
 * the original's column instead of a 1068×525 card: more of the (still slightly
 * disagreeing) Play shows around those panels. That is the field-aspect slice,
 * not a chrome regression; the Editor itself dropped. The raise is recorded
 * here rather than waved through.
 */
/**
 * Raised on 2026-09-25 under ADR 0058 (product decision: the assignments-only
 * inspector and the play sidebar). The sidebar is a 236 px column the original
 * does not have, so every state that shows the editor behind it carries it.
 * Measured on the same Linux machine, branch against main: Editor 18,105 →
 * 31,601 px; More 20,265 → 32,954; Export 19,507 → 32,926; Save 18,334 →
 * 31,752; palette 19,381 → 32,875; shortcuts 40,564 → 53,575; Formations
 * 27,738 → 31,592; Defenses 22,221 → 25,856. Present, Print and Demo did not
 * move. Each ratchet below is that branch measurement.
 */
const parityGap: Readonly<Record<string, number>> = {
  // 2.2860% (31,601 px) with the sidebar, from 1.6526% (22,846 px).
  editor: 0.0229,
  // 8.9932% (124,322 px), from 17.96% (248,333 px). The remaining Present
  // gap is the animation scrubber and the "1 / 5 · STICK — THUNDER"
  // variation line, both waiting on later phases.
  present: 0.09,
  // 0.8042% (11,117 px), from 0.84% (11,638 px).
  // Raised 0.0081 → 0.0225 under ADR 0047 (GitHub #69): the Print view is the
  // Print & export workspace beside the sheet, by product decision.
  print: 0.0225,
  // 2.0484% (28,317 px), from 2.12% (29,338 px). The Demo card was already
  // 1000×620; what remains is the original's cursor having already walked
  // the first clicks before Pause, and the 1.3% Player shift.
  demo: 0.0205,
  moreMenu: 0.0239, // 2.3838% (32,954 px), from 1.6666% (23,038 px)
  exportMenu: 0.0239, // 2.3818% (32,926 px), from 1.5982% (22,095 px)
  saveMenu: 0.023, // 2.2968% (31,752 px), from 1.6645% (23,010 px)
  commandPalette: 0.0238, // 2.3781% (32,875 px), from 1.6640% (23,004 px)
  shortcuts: 0.0388, // 3.8755% (53,575 px), from 2.4176% (33,420 px)
  // Raised 317 px with the field-aspect slice: more of the Play shows around
  // the panel. Card name-row and thumbnail-dot arithmetic now match the
  // original; any remaining gap is the Play behind the panel.
  formations: 0.0229, // 2.2853% (31,592 px), from 2.0059% (27,730 px)
  defenses: 0.0188, // 1.8703% (25,856 px), from 1.5938% (22,033 px)
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
    try {
      sessionStorage.setItem("chalk.seedStarter", "1");
    } catch {
      // Query string below still opts in.
    }
  });

  await page.goto("/?seed=starter");
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

  test("Present matches the original desktop golden", async ({ page }) => {
    await loadProductionShell(page);
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Present", exact: true })
      .click();
    await expect(page.getByRole("region", { name: "Present" })).toBeVisible();

    await expect(page).toHaveScreenshot(
      "original-present-desktop-1440x960.png",
      {
        animations: "disabled",
        caret: "hide",
        fullPage: true,
        maxDiffPixelRatio: allowedGap("present"),
      },
    );
  });

  test("Print matches the original desktop golden", async ({ page }) => {
    await loadProductionShell(page);
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Print & export", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Print preview", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Print preview" }),
    ).toBeVisible();

    await expect(page).toHaveScreenshot("original-print-desktop-1440x960.png", {
      animations: "disabled",
      caret: "hide",
      fullPage: true,
      maxDiffPixelRatio: allowedGap("print"),
    });
  });

  test("Demo matches the original desktop golden", async ({ page }) => {
    await loadProductionShell(page);
    await page.getByRole("button", { name: "Help", exact: true }).click();
    await page
      .getByRole("button", { name: "Demo — guided tour", exact: true })
      .click();
    await expect(page.getByRole("region", { name: "Demo" })).toBeVisible();
    await page.getByRole("button", { name: "Pause", exact: true }).click();

    await expect(page).toHaveScreenshot("original-demo-desktop-1440x960.png", {
      animations: "disabled",
      caret: "hide",
      fullPage: true,
      maxDiffPixelRatio: allowedGap("demo"),
    });
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
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Print & export", exact: true })
      .click();
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

  test("Formations browser matches the original", async ({ page }) => {
    await page.getByTitle("Browse formations — ⇧⌘F").click();
    await expect(
      page.getByPlaceholder("Search — gun, trips, empty, 12…"),
    ).toBeVisible();

    await expect(page).toHaveScreenshot(
      "original-editor-formations-desktop-1440x960.png",
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: allowedGap("formations"),
      },
    );
  });

  test("Defenses browser matches the original", async ({ page }) => {
    // The defensive call on an offensive Play sits behind the sidebar's
    // Shadow defense row (issue #64, ADR 0043, ADR 0053, ADR 0058); the
    // rail's Shadow button answers to the same name, so the click is scoped.
    await page
      .getByRole("navigation", { name: "Sidebar" })
      .getByRole("button", { name: /^Shadow defense/ })
      .click();
    await page.getByTitle("Browse defenses — ⇧⌘D").click();
    await expect(
      page.getByPlaceholder("Search — cover 3, nickel, blitz…"),
    ).toBeVisible();

    await expect(page).toHaveScreenshot(
      "original-editor-defenses-desktop-1440x960.png",
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: allowedGap("defenses"),
      },
    );
  });

  test("shortcut reference matches the original", async ({ page }) => {
    // Shortcuts is behind the sidebar's Help row (ADR 0058).
    await page
      .getByRole("navigation", { name: "Sidebar" })
      .getByRole("button", { name: /^Help/ })
      .click();
    await page
      .getByRole("button", { name: "Shortcuts ?", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Keyboard shortcuts" }),
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
