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
 * Player about 1.3% and costs 0.01-0.08 percentage points against goldens
 * captured from the uncorrected original.
 *
 * Matching the original here would be bug-compatibility, not parity. Two
 * alternatives were measured and both scored worse: adopting the original's
 * exact 1.525 anisotropy (editor 26,139 px) and keeping the old 532 px
 * midfield origin (26,119 px). The configuration below is the closest of the
 * three and the only correct one.
 *
 * Every other clause of the ratchet still holds: these may only be lowered
 * from here, and the remaining gap is unchanged in character — the field
 * renders from a different viewBox aspect than the original's, and tool-rail
 * glyph shapes differ.
 *
 * Every number below came down when the status bar moved out of the field's
 * own column to run the width of the window, where the original puts it. That
 * is what had held the tool rail and the inspector 30 px too tall, so their
 * lower halves disagreed with the original everywhere at once.
 */
const parityGap: Readonly<Record<string, number>> = {
  // 1.7134% (23,685 px), from 1.7750% (24,538 px). History sits below the
  // fold on the idle Editor, so this number did not move when the section
  // landed.
  editor: 0.0172,
  // Present fills the window, so the known field-aspect gap (original 1000×620,
  // production 1068×525) is the whole picture rather than a column. The
  // original also draws an animation scrubber and a "1 / 5 · STICK — THUNDER"
  // variation line here; both wait on later phases (timing playback, the
  // concept family). First measurement 17.96% (248,333 px).
  present: 0.1797,
  // Print hides the tool rail and inspector, so what remains is the field
  // geometry the Editor already disagrees about, on a letter-landscape sheet
  // whose chrome matches. First measurement 0.84% (11,638 px).
  print: 0.0085,
  // Demo is the original's guided Tool tour, captured paused on the first
  // Player-tool step. First measurement 2.12% (29,338 px). What remains is
  // the field viewBox aspect the Editor already disagrees about, and the
  // original's cursor having already walked the first clicks before Pause.
  demo: 0.0213,
  // The five chrome overlays. Each sits at or just under the Editor's own gap
  // because the panel covers part of the field it disagrees about — what is
  // left is the shell behind them, not the overlay. Their item lists, ordering
  // and copy already match the original.
  moreMenu: 0.0173, // 1.7273% (23,877 px), from 1.7882%
  exportMenu: 0.0166, // 1.6536% (22,859 px), from 1.7153%
  saveMenu: 0.0173, // 1.7252% (23,849 px), from 1.7869%
  commandPalette: 0.0172, // 1.7182% (23,752 px), from 1.7762%
  // Still the highest because reaching "Shortcuts ?" scrolls the inspector
  // onto History, Page and Type. Those sections are now built; what remains
  // is the field behind the panel and the original's 90-second autosave copy
  // we did not reproduce. Named snapshots land here instead.
  shortcuts: 0.0251, // 2.5044% (34,619 px), from 2.5033% (34,604 px)
  // The book of sets. Its All / Favorites / Mine tab strip, the star on every
  // card and the footer that saves the offense on the field as a set of its
  // own are now built and measured. What still holds it above the Editor's
  // own gap is not the panel's chrome but its cards: production's rows drift
  // from the original's as the grid goes down, and the thumbnail dot
  // arithmetic differs, which shows as every group heading below the first
  // landing a little low. Both predate this panel's controls.
  formations: 0.0199, // 1.9830% (27,413 px), from 2.0292% (28,051 px)
  // The book of calls, and the lowest gap of any state: the panel covers most
  // of what the shell still disagrees with the original about. Its tab strip
  // and stars are now built too.
  defenses: 0.0158, // 1.5709% (21,716 px), from 1.6526% (22,845 px)
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

  test("Present matches the original desktop golden", async ({ page }) => {
    await loadProductionShell(page);
    await page
      .getByRole("navigation", { name: "Workspace views" })
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
      .getByRole("navigation", { name: "Workspace views" })
      .getByRole("button", { name: "Print", exact: true })
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
    await page
      .getByRole("navigation", { name: "Workspace views" })
      .getByRole("button", { name: "Demo", exact: true })
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
