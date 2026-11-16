import { type Page } from "@playwright/test";
import { expect, openBlankEditor, test } from "./fixtures";

/**
 * A goal-line set, the way a Coach reaches for one inside the five: the
 * Formations browser has a Goal line chip and group, Goal Line Right puts
 * eleven men on the field heavy — the quarterback under center with the I
 * behind him, a tight end at each end of the line and the Z in a wing — and
 * the status bar calls it 22 personnel. Its left-handed twin is the same set
 * the other way. The field with Goal Line Right on it is the run's artifact.
 */
test.use({ viewport: { width: 1440, height: 960 } });

const status = (page: Page) => page.locator("[data-formation-status]");

/** The roster group's rows, in the order the inspector lists them. */
async function groupRows(page: Page, name: string): Promise<string[]> {
  return page
    .locator(".roster-group")
    .evaluateAll(
      (sections, name) =>
        sections
          .filter(
            (section) =>
              section.querySelector(".roster-heading")?.textContent === name,
          )
          .flatMap((section) =>
            [...section.querySelectorAll("button.roster-row")].map(
              (row) => row.getAttribute("aria-label") ?? "",
            ),
          ),
      name,
    );
}

test("Goal Line is a 22-personnel set in the Formations browser, with its own group and a left-handed twin", async ({
  page,
}, testInfo) => {
  await openBlankEditor(page);

  await page.keyboard.press("Control+Shift+f");
  const browser = page.getByRole("dialog", { name: "Formations" });
  await expect(browser).toBeVisible();

  // The set has its own chip, and picking it leaves only the goal-line sets.
  await browser.getByRole("button", { name: "Goal line", exact: true }).click();
  await expect(browser.locator(".browser-group-head")).toHaveCount(1);
  await expect(browser.locator(".browser-group-head")).toContainText(
    "Goal line · heavy",
  );
  await expect(
    browser.getByText("Goal Line Right", { exact: true }),
  ).toBeVisible();
  await expect(
    browser.getByText("Goal Line Left", { exact: true }),
  ).toBeVisible();

  await browser.getByText("Goal Line Right", { exact: true }).click();
  await expect(browser).toBeHidden();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await page.keyboard.press("Escape");

  await expect(status(page)).toHaveText("GOAL LINE RIGHT · 22");
  await expect
    .poll(() => groupRows(page, "Backs"))
    .toEqual([
      "Q: No assignment yet — Quarterback",
      "F: No route yet — Fullback",
      "H: No route yet — Tailback",
    ]);
  await expect
    .poll(() => groupRows(page, "Skill"))
    .toEqual([
      "U: No route yet — Tight end",
      "Y: No route yet — Tight end",
      "Z: No route yet — Receiver",
    ]);
  await page.screenshot({
    path: testInfo.outputPath("goal-line-right.png"),
  });

  // The left-handed twin is the same set with the wing on the other side.
  // Realigning keeps each man's letter, so the Z who was the right wing is
  // now the left wing, still off the line outside a tight end.
  // Where the Z stands across from the quarterback: plus is to his right.
  const wingSide = () =>
    page.locator("[data-scene-player]").evaluateAll((men) => {
      const x = (letter: string) =>
        Number(
          men
            .find((man) =>
              man.getAttribute("aria-label")?.startsWith(`${letter} `),
            )
            ?.getAttribute("data-base-x"),
        );
      return Math.sign(x("Z") - x("Q"));
    });
  expect(await wingSide()).toBe(1);
  await page.keyboard.press("Control+Shift+f");
  await browser.getByRole("button", { name: "Goal line", exact: true }).click();
  await browser.getByText("Goal Line Left", { exact: true }).click();
  await expect(browser).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(status(page)).toHaveText("GOAL LINE LEFT · 22");
  await expect.poll(wingSide).toBe(-1);
  await page.screenshot({
    path: testInfo.outputPath("goal-line-left.png"),
  });
});
