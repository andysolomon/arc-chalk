import { expect, openGamePlans, test } from "./fixtures";

/**
 * Issue #167: a wristband cell is read through a wrist window, so its
 * picture is the play cropped to itself with heavy lines and no yard
 * numbers, hash ticks or grid, the call code is the biggest thing in the
 * cell, and a defensive call prints no "—P" personnel placeholder.
 *
 * Artifacts: `wristband.png` (the band as printed, at a fixed viewport) and
 * `wristband.pdf` (the same band on letter paper), both from the seeded
 * starter book on this commit.
 */
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "The band is paper, printed to PDF, which is Chromium's.",
);

test("prints a prepared plan's wristband that reads on a wrist", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    // The band opens in its own window and asks to print; headless has no
    // dialog to raise, so the call is a no-op.
    window.print = () => undefined;
  });
  await page.goto("/");

  const workspace = await openGamePlans(page);
  await workspace.getByRole("button", { name: "New plan" }).click();
  await workspace.getByLabel("Plan name").fill("Week 6");
  await workspace.getByRole("button", { name: "Create plan" }).click();
  await workspace
    .getByRole("group", { name: "Unit" })
    .getByRole("button", { name: "All" })
    .click();
  for (const name of [
    /^Stick — Thunder$/,
    /^Four Verticals/,
    /^Cover 3 — Fire Zone/,
  ]) {
    await workspace.getByRole("checkbox", { name }).check();
  }
  await workspace.getByRole("button", { name: /^Add 3 to plan/ }).click();
  const codes = workspace.getByLabel(/^Call number for/);
  for (const [index, code] of ["10", "12", "40"].entries()) {
    await codes.nth(index).fill(code);
    await codes.nth(index).press("Enter");
  }
  await workspace.getByRole("button", { name: "Prepare for game" }).click();
  await expect(workspace.getByText(/^Prepared/)).toBeVisible();

  const [band] = await Promise.all([
    page.waitForEvent("popup"),
    workspace.getByRole("button", { name: "Wristband", exact: true }).click(),
  ]);
  await band.waitForLoadState();
  await band.setViewportSize({ width: 816, height: 1056 });
  const cells = band.locator(".wc");
  await expect(cells).toHaveCount(3);

  // Every cell's picture is cropped to its play, not the whole page window.
  for (const box of await band
    .locator(".wc svg.field-diagram")
    .evaluateAll((svgs) => svgs.map((svg) => svg.getAttribute("viewBox")))) {
    const [, , width, height] = (box ?? "").split(/\s+/).map(Number);
    expect(width).toBeGreaterThan(0);
    expect(height! * (1000 / width!)).toBeLessThan(620);
  }
  // No yard numbers, hash ticks or grid in a cell; the line of scrimmage
  // stays, drawn dark.
  for (const mark of [".yard-numbers", ".hash", ".field-grid"]) {
    await expect(band.locator(`.wc svg ${mark}`).first()).toBeHidden();
  }
  // A level line has no height, so it is read off its style, not its box.
  const scrimmage = await band
    .locator(".wc svg .line-of-scrimmage")
    .first()
    .evaluate((line) => getComputedStyle(line));
  expect(scrimmage.display).not.toBe("none");
  expect(parseFloat(scrimmage.strokeWidth)).toBeGreaterThanOrEqual(3);
  // The drawn play fills most of the cell's width.
  const fill = await cells.first().evaluate((cell) => {
    const svg = cell.querySelector("svg")!;
    const drawn = svg.querySelector(".players")!.getBoundingClientRect();
    return drawn.width / cell.getBoundingClientRect().width;
  });
  expect(fill).toBeGreaterThan(0.6);

  // The code reads first: larger than the play's name beside it.
  const [codeSize, nameSize] = await cells
    .first()
    .evaluate((cell) => [
      parseFloat(getComputedStyle(cell.querySelector(".cc")!).fontSize),
      parseFloat(getComputedStyle(cell.querySelector("b")!).fontSize),
    ]);
  expect(codeSize).toBeGreaterThan(nameSize);
  expect(codeSize).toBeGreaterThanOrEqual(14);

  // Offense counts its personnel; the defense names its own package, never
  // "—P" or its scout offense's count.
  await expect(cells.nth(0).locator(".pn")).toHaveText("11P");
  await expect(cells.nth(2)).toContainText("Cover 3 — Fire Zone");
  for (const personnel of await cells.nth(2).locator(".pn").allTextContents()) {
    expect(personnel).toMatch(/^(Base|Nickel|Dime)$/);
  }
  await expect(band.locator("body")).not.toContainText("—P");

  await band.screenshot({ path: testInfo.outputPath("wristband.png") });
  await band.pdf({
    path: testInfo.outputPath("wristband.pdf"),
    format: "Letter",
    preferCSSPageSize: true,
  });
});
