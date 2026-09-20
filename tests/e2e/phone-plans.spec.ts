import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Game-plan forms and browser heads on a phone (issue #94), and the touch
 * targets the first pass left out (issue #95): one column, actions that
 * wrap whole, a search box with a row to itself, and 44 px boxes that do
 * not overlap their neighbours.
 */
const VIEWPORTS = [
  { name: "360×800", width: 360, height: 800 },
  { name: "390×844", width: 390, height: 844 },
  { name: "430×932", width: 430, height: 932 },
];

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const inside = async (
  locator: Locator,
  viewport: { width: number; height: number },
): Promise<Box> => {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const what = (await locator.evaluate((node) => node.outerHTML)).slice(0, 160);
  expect(box, what).not.toBeNull();
  expect(box!.x, what).toBeGreaterThanOrEqual(-0.5);
  expect(box!.y, what).toBeGreaterThanOrEqual(-0.5);
  expect(box!.x + box!.width, what).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box!.y + box!.height, what).toBeLessThanOrEqual(viewport.height + 0.5);
  return box!;
};

const touchSized = (box: Box) => {
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
};

const disjoint = (boxes: readonly Box[]) => {
  for (let a = 0; a < boxes.length; a += 1) {
    for (let b = a + 1; b < boxes.length; b += 1) {
      const p = boxes[a]!;
      const q = boxes[b]!;
      const overlap =
        p.x < q.x + q.width &&
        q.x < p.x + p.width &&
        p.y < q.y + q.height &&
        q.y < p.y + p.height;
      expect(overlap, `${a} and ${b} overlap`).toBe(false);
    }
  }
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

const openGamePlans = async (page: Page) => {
  await page.goto("/");
  await expect(page.getByText("Read only")).toBeVisible();
  // The phone reports a coarse pointer; every sizing rule below hangs on it.
  expect(
    await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
  ).toBe(true);
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Playbooks", exact: true })
    .tap();
  await page
    .getByRole("navigation", { name: "Playbooks pages" })
    .getByRole("button", { name: "Game plans", exact: true })
    .tap();
  const workspace = page.getByRole("region", { name: "Game plans" });
  await expect(workspace).toBeVisible();
  return workspace;
};

for (const viewport of VIEWPORTS) {
  test.describe(`game plans on a phone at ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });

    test("creates, fills, prepares and renames a plan one column wide", async ({
      page,
    }) => {
      const workspace = await openGamePlans(page);
      await workspace.getByRole("button", { name: "New plan" }).tap();
      const form = workspace.getByRole("form", { name: "New game plan" });
      const formBox = await inside(form, viewport);

      // Coordinator choices sit whole inside the form, none clipped.
      const choices = form.getByRole("group", { name: "Coordinator" });
      const choiceButtons = choices.getByRole("button");
      const choiceBoxes: Box[] = [];
      for (let index = 0; index < (await choiceButtons.count()); index += 1) {
        const box = await inside(choiceButtons.nth(index), viewport);
        expect(box.x + box.width).toBeLessThanOrEqual(
          formBox.x + formBox.width + 0.5,
        );
        choiceBoxes.push(box);
      }
      disjoint(choiceBoxes);

      await workspace.getByLabel("Plan name").fill("Week 3 — Homecoming");
      await workspace.getByLabel("Opponent").fill("Central Catholic Crusaders");
      await workspace
        .getByRole("textbox", { name: "Game", exact: true })
        .fill("Week 3, Homecoming, under the lights");
      await inside(
        workspace.getByRole("button", { name: "Create plan" }),
        viewport,
      );
      await workspace.getByRole("button", { name: "Create plan" }).tap();
      await expect(
        workspace.getByRole("button", { name: "Openers", exact: true }),
      ).toBeVisible();
      await noRootOverflow(page);

      const boxes = workspace.getByRole("checkbox");
      const count = await boxes.count();
      expect(count).toBeGreaterThanOrEqual(2);
      for (let index = 0; index < count; index += 1) {
        await boxes.nth(index).check();
      }
      await workspace
        .getByRole("button", { name: new RegExp(`^Add ${count} to plan`) })
        .tap();
      const codes = workspace.getByLabel(/^Call number for/);
      await expect(codes).toHaveCount(count);
      await codes.first().fill("12");
      await codes.first().press("Enter");

      // Reorder controls stand 44 px apart from each other.
      const up = await inside(
        workspace.getByRole("button", { name: "Move Openers up" }),
        viewport,
      );
      const down = await inside(
        workspace.getByRole("button", { name: "Move Openers down" }),
        viewport,
      );
      touchSized(up);
      touchSized(down);
      disjoint([up, down]);

      // Prepare has an obvious button and a readable result under it.
      const prepare = workspace.getByRole("button", {
        name: "Prepare for game",
      });
      const prepareBox = await inside(prepare, viewport);
      expect(prepareBox.height).toBeGreaterThanOrEqual(44);
      await prepare.tap();
      const status = workspace
        .getByRole("status")
        .filter({ hasText: /^Prepared/ });
      const statusBox = await inside(status, viewport);
      expect(statusBox.width).toBeGreaterThan(viewport.width * 0.5);

      // The three outputs wrap whole, each a finger's size, none overlapping.
      const outputs = workspace.getByRole("group", { name: "Outputs" });
      const outputBoxes: Box[] = [];
      for (const name of ["Call sheet", "Wristband", "Handout"]) {
        const box = await inside(
          outputs.getByRole("button", { name }),
          viewport,
        );
        expect(box.height).toBeGreaterThanOrEqual(44);
        outputBoxes.push(box);
      }
      disjoint(outputBoxes);
      await noRootOverflow(page);

      // Rename from the head, with the way back a finger's size.
      const title = workspace.getByRole("textbox", { name: "Plan name" });
      const titleBox = await inside(title, viewport);
      expect(titleBox.width).toBeGreaterThan(viewport.width * 0.4);
      await title.fill("Week 3 — Homecoming (revised)");
      await title.press("Enter");
      const back = workspace.getByRole("button", {
        name: "Back to game plans",
      });
      touchSized(await inside(back, viewport));
      await back.tap();
      await expect(
        workspace.getByRole("button", {
          name: /^Week 3 — Homecoming \(revised\)/,
        }),
      ).toBeVisible();

      // Row actions on the plan list stand apart, the destructive one included.
      const row = workspace.locator(".game-plan-row-actions").first();
      const rowButtons = row.getByRole("button");
      const rowBoxes: Box[] = [];
      for (let index = 0; index < (await rowButtons.count()); index += 1) {
        const box = await inside(rowButtons.nth(index), viewport);
        touchSized(box);
        rowBoxes.push(box);
      }
      expect(rowBoxes.length).toBeGreaterThanOrEqual(3);
      disjoint(rowBoxes);
      touchSized(
        await inside(
          workspace.getByRole("button", { name: "Close game plans" }),
          viewport,
        ),
      );
    });

    test("keeps the formation browser's search usable beside its tabs and close", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.getByText("Read only")).toBeVisible();
      await page.getByRole("button", { name: "Edit on this screen" }).tap();
      await page.getByRole("button", { name: "Inspector", exact: true }).tap();
      await page.getByTitle("Browse formations — ⇧⌘F").tap();
      const book = page.getByRole("dialog", { name: "Formations" });
      await expect(book).toBeVisible();

      const search = await inside(
        book.getByRole("textbox", { name: "Search formations" }),
        viewport,
      );
      expect(search.width).toBeGreaterThan(viewport.width * 0.7);
      const tabs: Box[] = [];
      for (const name of ["All", "Favorites", "Mine"]) {
        tabs.push(
          await inside(
            book
              .locator(".browser-tabs")
              .getByRole("tab", { name, exact: true }),
            viewport,
          ),
        );
      }
      disjoint(tabs);
      const close = await inside(book.locator(".browser-close"), viewport);
      touchSized(close);
      disjoint([search, close]);

      // The star on a card is a finger's size and apart from the pick.
      const star = book.locator(".browser-star").first();
      const starBox = await inside(star, viewport);
      touchSized(starBox);
      await noRootOverflow(page);
      await book.locator(".browser-close").tap();
      await expect(book).toHaveCount(0);
    });
  });
}
