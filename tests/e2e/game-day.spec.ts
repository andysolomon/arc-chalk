import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Issue #67: a coordinator with only a thumb opens the prepared plan, finds
 * a call, steps between calls, comes back to a situation, and finds the
 * reader where he left it after a reload.
 */
async function preparePlan(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByText(/^Library/)).toBeVisible();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Game plans…" }).click();
  const workspace = page.getByRole("region", { name: "Game plans" });
  await workspace.getByRole("button", { name: "New plan" }).click();
  await workspace.getByLabel("Plan name").fill("Week 3");
  await workspace.getByLabel("Opponent").fill("Central");
  await workspace.getByRole("button", { name: "Create plan" }).click();
  await workspace.getByRole("checkbox", { name: /^Stick — Thunder$/ }).check();
  await workspace.getByRole("checkbox", { name: /^Four Verticals/ }).check();
  await workspace.getByRole("button", { name: /^Add 2 to plan/ }).click();
  const codes = workspace.getByLabel(/^Call number for/);
  await codes.first().fill("12");
  await codes.first().press("Enter");
  await codes.nth(1).fill("7");
  await codes.nth(1).press("Enter");
  await workspace.getByRole("button", { name: "Prepare for game" }).click();
  await expect(workspace.getByText(/^Prepared/)).toBeVisible();
}

test.describe("Game Day on a tablet", () => {
  test.use({
    viewport: { width: 1194, height: 834 },
    hasTouch: true,
    isMobile: true,
  });

  test("reads the prepared plan by touch and lands back where it was", async ({
    page,
  }, testInfo) => {
    await preparePlan(page);
    await page
      .getByRole("navigation", { name: "Workspace views" })
      .getByRole("button", { name: "Game Day", exact: true })
      .tap();
    const reader = page.getByRole("main", { name: "Game Day" });
    await reader.getByRole("button", { name: /Week 3/ }).tap();
    await expect(reader.getByText("Offense Week 3")).toBeVisible();
    await expect(reader.getByText(/Ready offline · 2 calls/)).toBeVisible();

    const calls = reader.getByRole("navigation", { name: "Calls" });
    await calls.getByRole("button", { name: /^12 / }).tap();
    const stage = reader.getByRole("region", { name: "Selected call" });
    await expect(stage.getByText("12", { exact: true })).toBeVisible();
    await expect(stage.locator("svg.field-diagram")).toBeVisible();
    // A finger on the diagram moves nothing: the men are where they were.
    const before = await stage
      .locator("[data-scene-player]")
      .first()
      .getAttribute("transform");
    const box = (await stage.locator("svg.field-diagram").boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(stage.locator("[data-scene-player]").first()).toHaveAttribute(
      "transform",
      before ?? "",
    );

    await reader.getByRole("button", { name: "Next call" }).tap();
    await expect(stage.getByText("7", { exact: true })).toBeVisible();
    await reader
      .getByRole("button", { name: /^Back to/ })
      .last()
      .tap();
    await reader.getByRole("button", { name: "Add to favorites" }).tap();
    await reader.getByRole("button", { name: /^Called/ }).tap();
    await page.screenshot({ path: testInfo.outputPath("game-day.png") });

    await page.reload();
    await expect(
      page.getByRole("main", { name: "Game Day" }).getByText("Offense Week 3"),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Selected call" }).getByText("7", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Called ×1/ }),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Situations" })
      .getByRole("button", { name: "★ Favorites" })
      .tap();
    await expect(
      page.getByRole("navigation", { name: "Calls" }).getByRole("button", {
        name: /^\d+ /,
      }),
    ).toHaveCount(1);
  });
});

test("Present steps variations with visible controls and a labeled Back", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Present" })
    .click();
  const present = page.getByRole("region", { name: "Present" });
  await expect(present.locator(".present-pos")).toContainText("1 / 5");
  await present.getByRole("button", { name: "Next variation" }).click();
  await expect(present.locator(".present-pos")).toContainText("2 / 5");
  await present.getByRole("button", { name: "Previous variation" }).click();
  await expect(present.locator(".present-pos")).toContainText("1 / 5");
  await present.getByRole("button", { name: "Back to the editor" }).click();
  await expect(
    page.getByRole("navigation", { name: "Drawing tools" }),
  ).toBeVisible();
});
