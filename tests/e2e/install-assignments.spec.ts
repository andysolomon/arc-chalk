import { type Page, type TestInfo } from "@playwright/test";
import { expect, openBlankEditor, startNewPlay, test } from "./fixtures";

/**
 * Issue #161: the install page is what a position group studies, so every
 * man on it says what he does. A quick route carries its name on the field
 * and in the table, and a defensive Play prints its defenders' zones, men and
 * gaps under a footer that names the call — built here the way a Coach
 * builds both, and printed from the Print & export preview.
 */
test.use({ viewport: { width: 1440, height: 960 } });

/** Selects a man on the field and presses a call in one of his grids. */
async function quickCall(
  page: Page,
  man: string,
  grid: "Quick routes" | "Quick assignments",
  name: string,
): Promise<void> {
  await page.locator(`[aria-label="${man}"]`).click({ force: true });
  await expect(page.locator(".player-heading")).toBeVisible();
  await page
    .locator(".section-heading", { hasText: grid })
    .locator("xpath=following-sibling::div[1]")
    .getByRole("button", { name, exact: true })
    .click();
}

/** Opens the current Play's install page in the print preview. */
async function installPreview(page: Page) {
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Print & export", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Print preview", exact: true })
    .click();
  const output = page.getByRole("region", { name: "Print & export" });
  await output.getByRole("button", { name: /^Install page/ }).click();
  return page.frameLocator('iframe[title="Preview"]');
}

/** The install table as `who: assignment` lines, top to bottom. */
async function tableRows(preview: ReturnType<Page["frameLocator"]>) {
  return preview
    .locator("table tbody tr")
    .evaluateAll((rows) =>
      rows.map(
        (row) =>
          `${row.children[0]?.textContent}: ${row.children[1]?.textContent}`,
      ),
    );
}

/**
 * The sheet as printed, saved beside the run's results: its own HTML opened
 * on a page of its own at a fixed width, then captured whole — and as a PDF
 * where the engine can print one, which is Chromium's.
 */
async function saveSheet(
  page: Page,
  preview: ReturnType<Page["frameLocator"]>,
  info: TestInfo,
  name: string,
  browserName: string,
) {
  const html = await preview
    .locator("html")
    .evaluate((root) => `<!doctype html>${root.outerHTML}`);
  const sheet = await page.context().newPage();
  await sheet.setViewportSize({ width: 816, height: 1056 });
  await sheet.setContent(html);
  await sheet.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: true,
  });
  if (browserName === "chromium") {
    await sheet.pdf({
      path: info.outputPath(`${name}.pdf`),
      preferCSSPageSize: true,
    });
  }
  await sheet.close();
}

test("a quick route is named on the field and in the install table", async ({
  page,
  browserName,
}, testInfo) => {
  await openBlankEditor(page);
  await page.getByTitle("Browse formations — ⇧⌘F").click();
  await page
    .getByRole("dialog", { name: "Formations" })
    .getByText("Gun Doubles Right", { exact: true })
    .click();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  const name = page.getByRole("textbox", { name: "Play name" });
  await name.fill("Doubles Rt Quick");
  await name.press("Enter");

  await quickCall(page, "X offense player", "Quick routes", "Go");
  await quickCall(page, "Y offense player", "Quick routes", "Dig");
  await quickCall(page, "Z offense player", "Quick routes", "Curl");

  // Each route says its call under the line, as a concept's routes do.
  await expect
    .poll(() =>
      page
        .locator('[data-scene-coaching$="-assignment"]')
        .allTextContents()
        .then((texts) => texts.sort()),
    )
    .toEqual(["CURL", "DIG", "GO"]);

  const preview = await installPreview(page);
  await expect(preview.locator("h1")).toHaveText("Doubles Rt Quick");
  await expect
    .poll(() => tableRows(preview))
    .toEqual(["X: Go", "Z: Curl", "Y: Dig"]);
  await expect(preview.locator("body")).not.toContainText("As drawn");
  await saveSheet(page, preview, testInfo, "offense-install-page", browserName);
});

test("a defensive install page lists every defender's job under the call it is", async ({
  page,
  browserName,
}, testInfo) => {
  await openBlankEditor(page);
  await startNewPlay(page, "defensive");
  const name = page.getByRole("textbox", { name: "Play name" });
  await name.fill("Cover 3 Mike");
  await name.press("Enter");

  await page.keyboard.press("Control+Shift+d");
  const browser = page.getByRole("dialog", { name: "Defenses" });
  await expect(browser).toBeVisible();
  const withLines = browser.getByRole("button", { name: "With assignments" });
  if ((await withLines.getAttribute("aria-pressed")) !== "true") {
    await withLines.click();
  }
  await browser
    .getByRole("textbox", { name: "Search defenses" })
    .fill("4-3 Cover 3");
  await browser.getByText("4-3 Cover 3", { exact: true }).click();
  await expect(browser).toBeHidden();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);

  // The Mike is sent from the Quick assignments, through the A gap.
  await quickCall(page, "M defense player", "Quick assignments", "A gap");

  const preview = await installPreview(page);
  await expect(preview.locator("h1")).toHaveText("Cover 3 Mike");
  await expect
    .poll(() => tableRows(preview))
    .toEqual([
      "LE: Contain",
      "LT: Rush",
      "RT: Rush",
      "RE: Contain",
      "W: Curl / flat",
      "M: A gap",
      "S: Hook",
      "LC: Deep 1/3",
      "RC: Deep 1/3",
      "F: Middle 1/3",
      "$: Curl / flat",
    ]);
  const footer = preview.locator(".mt span");
  await expect(footer).toHaveText(["Base", "4-3 Cover 3", "middle hash"]);
  await expect(preview.locator(".mt")).not.toContainText("—");
  await expect(preview.locator(".mt")).not.toContainText("strength");
  await saveSheet(page, preview, testInfo, "defense-install-page", browserName);
});
