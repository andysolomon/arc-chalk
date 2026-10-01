import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * A Game Plan calls a Play from another book on a phone (ADR 0067, issue
 * #157): the same picker as the desk, reached through the phone's own
 * doors. The scope buttons are a finger's size and stay inside the glass,
 * a row from the other book is labelled with it, and the call prepares.
 * The test ends with a screenshot of the plan.
 */
const VIEWPORT = { width: 390, height: 844 };

const OTHER = "Red Zone";

const inside = async (locator: Locator) => {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const what = (await locator.evaluate((node) => node.outerHTML)).slice(0, 160);
  expect(box, what).not.toBeNull();
  expect(box!.x, what).toBeGreaterThanOrEqual(-0.5);
  expect(box!.x + box!.width, what).toBeLessThanOrEqual(VIEWPORT.width + 0.5);
  return box!;
};

const noRootOverflow = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);

const gotoView = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name, exact: true })
    .tap();

/** The shelf, from the open book's bar on the Playbooks page. */
const openShelf = async (page: Page) => {
  await gotoView(page, "Playbooks");
  await page.getByTitle("All playbooks on this device").tap();
  const shelf = page.getByRole("region", { name: "Playbooks" });
  await expect(shelf).toBeVisible();
  return shelf;
};

test.describe(`cross-book game plans on a phone at ${VIEWPORT.width}×${VIEWPORT.height}`, () => {
  test.use({
    viewport: VIEWPORT,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });

  test("calls a play from another book with a finger and prepares it", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await expect(page.locator("header.topbar.phone-topbar")).toBeVisible();

    // A second book with one Play of its own.
    const shelf = await openShelf(page);
    const newName = shelf.getByRole("textbox", { name: "New playbook name" });
    await newName.fill(OTHER);
    await newName.press("Enter");
    await expect(page.locator(".book-title strong")).toHaveText(OTHER);
    await gotoView(page, "Editor");
    const playName = page.getByRole("textbox", { name: "Play name" });
    await playName.fill("Goal Line Power");
    await playName.press("Enter");
    // The phone's header folds the save state into one button; its label
    // says when the device has the Play.
    await expect(page.locator("button.save-state")).toHaveAttribute(
      "aria-label",
      "Saved on this device",
    );

    // Back in the starter book, a plan that calls it.
    const again = await openShelf(page);
    await again
      .getByRole("button", { name: "Open Chalk Starter Playbook" })
      .tap();
    await expect(page.locator(".book-title strong")).toHaveText(
      "Chalk Starter Playbook",
    );
    await page
      .getByRole("navigation", { name: "Book pages" })
      .getByRole("button", { name: "Game plans", exact: true })
      .tap();
    const workspace = page.getByRole("region", { name: "Game plans" });
    await workspace.getByRole("button", { name: "New plan" }).tap();
    await workspace.getByLabel("Plan name").fill("Week 3");
    await workspace.getByRole("button", { name: "Create plan" }).tap();
    await expect(
      workspace.getByRole("button", { name: "Openers", exact: true }),
    ).toBeVisible();

    const scope = workspace.getByRole("group", { name: "Pick from" });
    const thisBook = scope.getByRole("button", { name: "This book" });
    const allBooks = scope.getByRole("button", { name: "All my playbooks" });
    await expect(thisBook).toHaveAttribute("aria-pressed", "true");
    for (const button of [thisBook, allBooks]) {
      const box = await inside(button);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const goalLine = workspace.getByRole("checkbox", {
      name: `Goal Line Power (${OTHER})`,
    });
    await expect(goalLine).toHaveCount(0);
    await allBooks.tap();
    await expect(allBooks).toHaveAttribute("aria-pressed", "true");
    await expect(goalLine).toBeVisible();
    const row = workspace.locator(".game-plan-pick", {
      has: page.getByRole("checkbox", { name: `Goal Line Power (${OTHER})` }),
    });
    await inside(row.locator(".game-plan-pick-book"));
    await expect(row.locator(".game-plan-pick-book")).toHaveText(OTHER);
    await goalLine.check();
    await workspace.getByRole("button", { name: /^Add 1 to plan/ }).tap();
    const code = workspace.getByLabel(
      `Call number for Goal Line Power (${OTHER})`,
    );
    await expect(code).toBeVisible();
    await code.fill("3");
    await code.press("Enter");
    await workspace.getByRole("button", { name: "Prepare for game" }).tap();
    await expect(workspace.getByText(/^Prepared 1 call/)).toBeVisible();
    await noRootOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath("phone-cross-book-game-plan.png"),
      fullPage: true,
    });
  });
});
