import type { Page } from "@playwright/test";

import { expect, openSeededEditor, openSettings, test } from "./fixtures";

/**
 * Thanksgiving week (ADR 0082): from the Monday before the fourth Thursday of
 * November through the Sunday after it, the shell turns to autumn colours in
 * light and in dark, and turns back on its own. The field stays on white
 * paper. The clock and the time zone are pinned, so each run paints the same
 * week; the first test ends with screenshots of the autumn shell, light and
 * dark.
 */
test.use({ locale: "en-US", timezoneId: "America/Chicago" });

/** The shared fixture pins the season off; these tests let the calendar decide. */
const followTheCalendar = (page: Page) =>
  page.addInitScript(() => {
    try {
      sessionStorage.removeItem("chalk.season");
    } catch {
      // Without session storage nothing was pinned.
    }
  });

const season = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.season ?? "none");

const background = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((node) => getComputedStyle(node).backgroundColor);

const fieldPaper = (page: Page) =>
  page
    .locator(".field-paper")
    .first()
    .evaluate((node) => getComputedStyle(node).fill);

test("Thanksgiving Day wears autumn colours in light and dark, around a white field", async ({
  page,
}, testInfo) => {
  await page.clock.install({ time: new Date("2026-11-26T10:00:00-06:00") });
  await followTheCalendar(page);
  await page.emulateMedia({ colorScheme: "light" });
  await openSeededEditor(page);

  expect(await season(page)).toBe("thanksgiving");
  expect(await background(page, ".chalk-shell")).toBe("rgb(250, 246, 238)");
  expect(await fieldPaper(page)).toBe("rgb(255, 255, 255)");

  const settings = await openSettings(page);
  await settings.getByRole("tab", { name: "Appearance" }).click();
  await expect(settings.getByText("Happy Thanksgiving.")).toContainText(
    "through Sunday, November 29.",
  );
  await settings.getByRole("button", { name: "Close" }).click();
  await page.evaluate(async () => document.fonts.ready);
  await page.screenshot({
    path: testInfo.outputPath("thanksgiving-light.png"),
  });

  // Dark keeps the season: a warm dark shell, still a white field.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect
    .poll(() => background(page, ".chalk-shell"))
    .toBe("rgb(20, 16, 12)");
  expect(await season(page)).toBe("thanksgiving");
  expect(await fieldPaper(page)).toBe("rgb(255, 255, 255)");
  await page.screenshot({
    path: testInfo.outputPath("thanksgiving-dark.png"),
  });
});

test("an open Chalk takes the autumn colours off when the week ends", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-29T23:50:00-06:00") });
  await followTheCalendar(page);
  await page.emulateMedia({ colorScheme: "light" });
  await openSeededEditor(page);
  expect(await season(page)).toBe("thanksgiving");

  await page.clock.fastForward("30:00");
  await expect.poll(() => season(page)).toBe("none");
  expect(await background(page, ".chalk-shell")).toBe("rgb(250, 250, 250)");
});

// The week by the device's calendar, at both edges, in a year whose fourth
// Thursday is the 26th and in one where it is the 25th.
const calendar = [
  ["2026-11-22T23:59:00-06:00", "none"],
  ["2026-11-23T00:00:00-06:00", "thanksgiving"],
  ["2026-11-29T23:59:00-06:00", "thanksgiving"],
  ["2026-11-30T00:00:00-06:00", "none"],
  ["2027-11-21T23:59:00-06:00", "none"],
  ["2027-11-22T00:00:00-06:00", "thanksgiving"],
  ["2027-11-28T23:59:00-06:00", "thanksgiving"],
  ["2027-11-29T00:00:00-06:00", "none"],
] as const;

for (const [time, expected] of calendar) {
  test(`${time} opens as ${expected}`, async ({ page }) => {
    await page.clock.install({ time: new Date(time) });
    await followTheCalendar(page);
    await page.goto("/");
    // Set by the inline script before the first paint, not after React.
    expect(await season(page)).toBe(expected);
  });
}
