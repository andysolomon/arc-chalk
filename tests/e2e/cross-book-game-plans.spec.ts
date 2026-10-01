import type { Page } from "@playwright/test";

import { expect, openGamePlans, openSeededEditor, test } from "./fixtures";

/**
 * A Game Plan calls Plays from any of the Coach's books (ADR 0067, issue
 * #157). The plan lives in the starter book; a second book holds a Play of
 * its own and a Play with the starter's name. Add plays offers this book by
 * default and every book on request, each row from another book labelled
 * with it; a Play already in the plan is reported as before; Prepare freezes
 * the Play from the other book; the call sheet and Game Day read it; a
 * reload finds it all, with the scope remembered on the device; and the Play
 * deleted from its book is reported missing and carried on the next Prepare.
 * The test ends with a screenshot of the plan.
 */

const STARTER = "Chalk Starter Playbook";
const OTHER = "Red Zone";

const gotoView = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name, exact: true })
    .click();

/** The shelf, from the open book's bar on the Playbooks page. */
const openShelf = async (page: Page) => {
  await gotoView(page, "Playbooks");
  await page.getByTitle("All playbooks on this device").click();
  const shelf = page.getByRole("region", { name: "Playbooks" });
  await expect(shelf).toBeVisible();
  return shelf;
};

/** Names the Play on the field and waits for the device to have it. */
const namePlay = async (page: Page, name: string) => {
  const field = page.getByRole("textbox", { name: "Play name" });
  await field.fill(name);
  await field.press("Enter");
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();
};

const openPlans = async (page: Page) => {
  await page
    .getByRole("navigation", { name: "Book pages" })
    .getByRole("button", { name: "Game plans", exact: true })
    .click();
  const workspace = page.getByRole("region", { name: "Game plans" });
  await expect(workspace).toBeVisible();
  return workspace;
};

test("calls plays from another book, prepares them, and reports one deleted later", async ({
  page,
}, testInfo) => {
  // Two books, a plan, a packet, a reload, Game Day and a deletion: one
  // story, longer than the default allows.
  test.setTimeout(180_000);
  await openSeededEditor(page);

  // A second book with a Play of its own and one named like the starter's.
  const shelf = await openShelf(page);
  await shelf.getByRole("textbox", { name: "New playbook name" }).fill(OTHER);
  await shelf
    .getByRole("textbox", { name: "New playbook name" })
    .press("Enter");
  await expect(page.locator(".book-title strong")).toHaveText(OTHER);
  await gotoView(page, "Editor");
  await namePlay(page, "Stick — Thunder");
  await page
    .getByRole("banner")
    .getByRole("button", { name: "New play" })
    .click();
  await page
    .getByRole("group", { name: "New play" })
    .getByRole("button", { name: /^New offensive play/ })
    .click();
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Untitled play",
  );
  await namePlay(page, "Goal Line Power");

  // Back in the starter book, a plan of its own.
  const starterShelf = await openShelf(page);
  await starterShelf.getByRole("button", { name: `Open ${STARTER}` }).click();
  await expect(page.locator(".book-title strong")).toHaveText(STARTER);
  const workspace = await openPlans(page);
  await workspace.getByRole("button", { name: "New plan" }).click();
  await workspace.getByLabel("Plan name").fill("Week 3");
  await workspace.getByLabel("Opponent").fill("Central");
  await workspace.getByRole("button", { name: "Create plan" }).click();
  await expect(
    workspace.getByRole("button", { name: "Openers", exact: true }),
  ).toBeVisible();

  // This book first: the other book's Play is not offered.
  const scope = workspace.getByRole("group", { name: "Pick from" });
  await expect(
    scope.getByRole("button", { name: "This book" }),
  ).toHaveAttribute("aria-pressed", "true");
  const goalLine = workspace.getByRole("checkbox", {
    name: `Goal Line Power (${OTHER})`,
  });
  const otherStick = workspace.getByRole("checkbox", {
    name: `Stick — Thunder (${OTHER})`,
  });
  const starterStick = workspace.getByRole("checkbox", {
    name: "Stick — Thunder",
    exact: true,
  });
  await expect(goalLine).toHaveCount(0);
  await expect(starterStick).toBeVisible();

  // All my playbooks: every book's Plays, the other book's rows saying so,
  // and two Plays called Stick told apart by the book.
  await scope.getByRole("button", { name: "All my playbooks" }).click();
  await expect(goalLine).toBeVisible();
  await expect(otherStick).toBeVisible();
  await expect(starterStick).toBeVisible();
  // A row is found by its own checkbox, from the page so the filter reads
  // inside the row rather than looking for the workspace under it.
  const rowOf = (name: string, exact = false) =>
    workspace.locator(".game-plan-pick", {
      has: page.getByRole("checkbox", { name, exact }),
    });
  const goalLineRow = rowOf(`Goal Line Power (${OTHER})`);
  await expect(goalLineRow.locator(".game-plan-pick-book")).toHaveText(OTHER);
  await expect(
    rowOf("Stick — Thunder", true).locator(".game-plan-pick-book"),
  ).toHaveCount(0);

  // Search and the unit chips span the chosen scope.
  const search = workspace.getByLabel("Search plays to add");
  await search.fill("goal line");
  await expect(workspace.getByRole("checkbox")).toHaveCount(1);
  await expect(goalLine).toBeVisible();
  await search.fill("");
  await workspace
    .getByRole("group", { name: "Unit" })
    .getByRole("button", { name: "Defense" })
    .click();
  await expect(goalLine).toHaveCount(0);
  await workspace
    .getByRole("group", { name: "Unit" })
    .getByRole("button", { name: "Offense" })
    .click();
  await expect(goalLine).toBeVisible();

  await goalLine.check();
  await otherStick.check();
  await starterStick.check();
  await expect(workspace.locator("[data-preview]")).toContainText(
    "3 new calls",
  );
  await workspace.getByRole("button", { name: /^Add 3 to plan/ }).click();
  const goalLineCode = workspace.getByLabel(
    `Call number for Goal Line Power (${OTHER})`,
  );
  const otherStickCode = workspace.getByLabel(
    `Call number for Stick — Thunder (${OTHER})`,
  );
  const starterStickCode = workspace.getByLabel(
    "Call number for Stick — Thunder",
    {
      exact: true,
    },
  );
  await expect(goalLineCode).toBeVisible();
  await expect(otherStickCode).toBeVisible();
  await expect(starterStickCode).toBeVisible();
  await starterStickCode.fill("12");
  await starterStickCode.press("Enter");
  await otherStickCode.fill("7");
  await otherStickCode.press("Enter");
  await goalLineCode.fill("3");
  await goalLineCode.press("Enter");

  // A Play already in the plan is reported as before, whichever book it is
  // from; a code collision names the holder with its book.
  await expect(goalLineRow.locator(".game-plan-pick-meta")).toContainText(
    "in plan",
  );
  await goalLine.check();
  await expect(workspace.locator("[data-preview]")).toContainText(
    "1 already in the plan",
  );
  await goalLine.uncheck();
  await starterStickCode.fill("7");
  await starterStickCode.press("Enter");
  await expect(
    workspace.getByText(`It belongs to Stick — Thunder (${OTHER}).`),
  ).toBeVisible();
  await starterStickCode.fill("12");
  await starterStickCode.press("Enter");

  // Prepare freezes the other book's Plays into the packet.
  await workspace.getByRole("button", { name: "Prepare for game" }).click();
  await expect(workspace.getByText(/^Prepared 3 calls/)).toBeVisible();
  const popup = page.waitForEvent("popup");
  await workspace.getByRole("button", { name: "Call sheet" }).click();
  const sheet = await popup;
  await expect(sheet.locator("body")).toContainText("Goal Line Power");
  await expect(sheet.locator("body")).toContainText("Week 3");
  await sheet.close();

  // Chalk opened again on this device finds the calls by name across books,
  // the packet current, and the picker where it was left — the scope is the
  // device's, not the plan's. A new tab, because this page's seed script
  // would wipe the device on a reload.
  const context = page.context();
  await page.close();
  const again = await context.newPage();
  await again.setViewportSize({ width: 1440, height: 960 });
  await again.goto("/");
  await expect(again.getByRole("textbox", { name: "Play name" })).toBeVisible({
    timeout: 30_000,
  });
  const dialog = await openGamePlans(again);
  await dialog.getByRole("button", { name: /^Week 3 / }).click();
  await expect(
    dialog.getByLabel(`Call number for Goal Line Power (${OTHER})`),
  ).toHaveValue("3");
  await expect(
    dialog.getByLabel(`Call number for Stick — Thunder (${OTHER})`),
  ).toHaveValue("7");
  await expect(dialog.locator(".game-plan-status")).toHaveAttribute(
    "data-stale",
    "false",
  );
  await expect(
    dialog
      .getByRole("group", { name: "Pick from" })
      .getByRole("button", { name: "All my playbooks" }),
  ).toHaveAttribute("aria-pressed", "true");
  await again.keyboard.press("Escape");

  // Game Day reads the packet with the other book's call in it.
  await gotoView(again, "Game Day");
  const reader = again.getByRole("main", { name: "Game Day" });
  await reader.getByRole("button", { name: /Week 3/ }).click();
  await expect(reader.getByText(/Ready offline · 3 calls/)).toBeVisible();
  await expect(
    reader
      .getByRole("navigation", { name: "Calls" })
      .getByRole("button", { name: /^3 Goal Line Power/ }),
  ).toBeVisible();
  await expect(reader.locator(".reader-notice")).toHaveCount(0);

  // The Play deleted from its own book: the plan says so, the call keeps
  // the name its packet froze, and the next Prepare carries it forward.
  const shelfAgain = await openShelf(again);
  await shelfAgain.getByRole("button", { name: `Open ${OTHER}` }).click();
  await expect(again.locator(".book-title strong")).toHaveText(OTHER);
  await again
    .getByRole("navigation", { name: "Book pages" })
    .getByRole("button", { name: "Plays", exact: true })
    .click();
  await again
    .getByRole("button", { name: "Actions for Goal Line Power" })
    .click();
  const actions = again.getByRole("dialog", { name: "Goal Line Power" });
  await actions.getByRole("button", { name: "Delete…" }).click();
  await actions.getByRole("button", { name: "Delete play" }).click();
  await expect(actions).toBeHidden();
  const back = await openShelf(again);
  await back.getByRole("button", { name: `Open ${STARTER}` }).click();
  await expect(again.locator(".book-title strong")).toHaveText(STARTER);
  const plans = await openPlans(again);
  await plans.getByRole("button", { name: /^Week 3 / }).click();
  const status = plans.locator(".game-plan-status");
  await expect(status).toHaveAttribute("data-stale", "true");
  await expect(status).toContainText("1 missing");
  await expect(
    plans.getByLabel(`Call number for Goal Line Power (${OTHER})`),
  ).toHaveValue("3");
  await plans.getByRole("button", { name: "Prepare for game" }).click();
  await expect(
    plans.getByText(/^Prepared 3 calls · 1 carried from the last revision/),
  ).toBeVisible();
  await again.screenshot({
    path: testInfo.outputPath("cross-book-game-plan.png"),
    fullPage: false,
  });
});
