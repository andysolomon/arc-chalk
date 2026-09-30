import { type Page } from "@playwright/test";

import { expect, openSeededEditor, test } from "./fixtures";

/**
 * A route's name follows the route (issue #160). A concept names each man's
 * route; picking a quick route renames it, unless the Coach typed the name
 * himself, which stays and is said so. Deleting the route takes the name it
 * carried with it. Undo brings the line and its name back together. The
 * field and the roster after the rename are the run's artifact.
 */

const inspector = (page: Page) =>
  page.getByRole("complementary", { name: "Play inspector" });

/** A new offensive play, lined up in Gun Trips Right and running Mesh. */
async function meshFromGunTripsRight(page: Page): Promise<void> {
  await openSeededEditor(page);
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("banner").locator("button.new-play").click();
  const name = page.getByRole("textbox", { name: "Play name" });
  await name.fill("Mesh — route names");
  await name.press("Enter");
  await page.getByTitle("Browse formations — ⇧⌘F").click();
  await page
    .getByRole("dialog", { name: "Formations" })
    .getByText("Gun Trips Right", { exact: true })
    .click();
  await inspector(page)
    .getByRole("button", { name: /Concept ›/ })
    .click();
  await page
    .getByRole("dialog", { name: "Concepts and line calls" })
    .getByRole("button", { name: /^Mesh/ })
    .first()
    .click();
  await expect(
    inspector(page).getByRole("button", { name: "Y: DIG — Tight end" }),
  ).toBeVisible();
}

/** Back from a man's panel to the roster. */
async function backToRoster(page: Page): Promise<void> {
  await inspector(page)
    .getByRole("button", { name: "Back to the play" })
    .click();
}

test("renames a concept's route when a quick route replaces it", async ({
  page,
}, testInfo) => {
  await meshFromGunTripsRight(page);
  await expect(page.getByRole("img", { name: "Y route: DIG" })).toHaveCount(1);

  await inspector(page)
    .getByRole("button", { name: "Y: DIG — Tight end" })
    .click();
  await inspector(page).getByRole("button", { name: "Curl" }).click();

  // The field, its accessible name and the roster all say what he now runs.
  await expect(page.getByRole("img", { name: "Y route: CURL" })).toHaveCount(1);
  await expect(page.getByRole("img", { name: "Y route: DIG" })).toHaveCount(0);
  await backToRoster(page);
  await expect(
    inspector(page).getByRole("button", { name: "Y: CURL — Tight end" }),
  ).toBeVisible();

  // One undo takes the shape and its name back together.
  await page.getByTitle("Undo Edit route").click();
  await expect(page.getByRole("img", { name: "Y route: DIG" })).toHaveCount(1);
  await expect(
    inspector(page).getByRole("button", { name: "Y: DIG — Tight end" }),
  ).toBeVisible();
  await page.getByTitle("Redo Edit route").click();
  await expect(page.getByRole("img", { name: "Y route: CURL" })).toHaveCount(1);
  await expect(
    inspector(page).getByRole("button", { name: "Y: CURL — Tight end" }),
  ).toBeVisible();

  // The toast times out, so the artifact is the same on every run.
  await expect(page.locator(".toast")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("curl-renamed.png"),
  });
});

test("keeps a name the Coach typed, and says so", async ({ page }) => {
  await meshFromGunTripsRight(page);

  await inspector(page)
    .getByRole("button", { name: "Y: DIG — Tight end" })
    .click();
  await inspector(page).getByRole("button", { name: "Edit" }).first().click();
  const assignment = inspector(page).getByRole("textbox", {
    name: "Assignment",
  });
  await assignment.fill("Sit vs zone");
  await assignment.blur();
  await expect(
    page.getByRole("img", { name: "Y route: Sit vs zone" }),
  ).toHaveCount(1);

  await inspector(page)
    .getByRole("button", { name: "Back to the play" })
    .click();
  await inspector(page)
    .getByRole("button", { name: "Y: Sit vs zone — Tight end" })
    .click();
  await inspector(page).getByRole("button", { name: "Curl" }).click();

  // The Coach's words stand, and the toast says they were kept.
  await expect(page.getByRole("status")).toContainText("Sit vs zone");
  await expect(page.getByRole("status")).toContainText("kept");
  await expect(
    page.getByRole("img", { name: "Y route: Sit vs zone" }),
  ).toHaveCount(1);
});

test("takes a deleted route's name off the roster and the count", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  const roster = inspector(page);
  const count = roster.locator(".assignments-count");
  const before = await count.textContent();

  // H's route, named by hand.
  await roster.getByRole("button", { name: /^H: / }).click();
  await roster.getByRole("button", { name: "Edit" }).first().click();
  const assignment = roster.getByRole("textbox", { name: "Assignment" });
  await assignment.fill("BUBBLE");
  await assignment.blur();
  await expect(page.getByRole("img", { name: "H route: BUBBLE" })).toHaveCount(
    1,
  );

  // Deleted from his panel with the × on its row.
  await roster.getByRole("button", { name: "Back to the play" }).click();
  await roster.getByRole("button", { name: "H: BUBBLE — Slot" }).click();
  await roster.getByRole("button", { name: /^Delete Base stem/ }).click();
  await expect(roster.getByText(/^No route yet/)).toBeVisible();
  await backToRoster(page);

  await expect(
    roster.getByRole("button", { name: "H: No route yet — Slot" }),
  ).toBeVisible();
  await expect(page.getByText("BUBBLE")).toHaveCount(0);
  await expect(count).not.toHaveText(before!);
  const [assigned, total] = before!.split(" of ").map(Number);
  await expect(count).toHaveText(`${assigned! - 1} of ${total}`);

  await page.screenshot({
    path: testInfo.outputPath("deleted-route-name-gone.png"),
  });

  // One undo brings the line and its name back together.
  await page.getByTitle("Undo Delete route").click();
  await expect(page.getByRole("img", { name: "H route: BUBBLE" })).toHaveCount(
    1,
  );
  await expect(
    roster.getByRole("button", { name: "H: BUBBLE — Slot" }),
  ).toBeVisible();
  await expect(count).toHaveText(before!);
});
