import type { Locator, Page } from "@playwright/test";

import { expect, openSeededEditor, openViewAndLibrary, test } from "./fixtures";

/**
 * Every sidebar row's popover opens the same way: the row's name as its
 * title with any count, action or ? beside it, then the control, then words,
 * on one even inset. The Library used to nest an inspector section inside the
 * popover — 27 px over its heading and 10 px under its last button, a letter-
 * spaced caps heading whose "+ Variation" inherited the spacing — and Ball on
 * and the shadow left their ? alone on a line under the control. The test
 * ends on a screenshot of the Library popover at a fixed 1440×960, dark.
 */
test.use({ viewport: { width: 1440, height: 960 }, colorScheme: "dark" });

const rowButton = (page: Page, id: string) =>
  page.locator(`[data-row="${id}"] > button.sidebar-row`);

const popover = (page: Page) =>
  page.locator(".sidebar-row-wrap .sidebar-popover");

/** The popover's four paddings, which should be one number. */
const paddings = (pop: Locator) =>
  pop.evaluate((node) => {
    const style = getComputedStyle(node);
    return [
      style.paddingTop,
      style.paddingRight,
      style.paddingBottom,
      style.paddingLeft,
    ];
  });

/** Distance from the popover's border box to its first and last child. */
const insets = (pop: Locator) =>
  pop.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const first = node.firstElementChild!.getBoundingClientRect();
    const last = node.lastElementChild!.getBoundingClientRect();
    return {
      top: Math.round(first.top - box.top),
      bottom: Math.round(box.bottom - last.bottom),
      left: Math.round(first.left - box.left),
    };
  });

test("each sidebar popover leads with its name and sits on one even inset", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await openViewAndLibrary(page);

  for (const { id, title } of [
    { id: "ball", title: "Ball on" },
    { id: "shadow", title: "Shadow defense" },
    { id: "layers", title: "Show on field" },
    { id: "library", title: "Library" },
  ]) {
    await rowButton(page, id).click();
    const pop = popover(page);
    await expect(pop).toBeVisible();
    const head = pop.locator(".sidebar-popover-head");
    await expect(head.locator(".sidebar-popover-title")).toHaveText(title);
    expect(new Set(await paddings(pop)).size).toBe(1);
    const inset = await insets(pop);
    expect(inset.top).toBe(inset.left);
    expect(inset.bottom).toBe(inset.left);
    await rowButton(page, id).click();
    await expect(pop).toHaveCount(0);
  }

  // Ball on: the ? stands in the head, and what it says opens under the
  // title, above the hashes — not alone under them.
  await rowButton(page, "ball").click();
  const ball = popover(page);
  const ask = ball
    .locator(".sidebar-popover-head")
    .getByRole("button", { name: "About the formation" });
  await expect(ask).toBeVisible();
  await ask.click();
  const words = ball.locator(".hint-body");
  await expect(words).toBeVisible();
  const hashes = ball.getByRole("button", { name: "Middle", exact: true });
  expect((await words.boundingBox())!.y).toBeLessThan(
    (await hashes.boundingBox())!.y,
  );
  await rowButton(page, "ball").click();

  // The shadow's popover is titled by it, so its switch carries no second
  // copy of the name.
  await rowButton(page, "shadow").click();
  const shadow = popover(page);
  await expect(shadow.getByText("Shadow defense", { exact: true })).toHaveCount(
    1,
  );
  await expect(
    shadow
      .locator(".sidebar-popover-head")
      .getByRole("button", { name: "About the shadow" }),
  ).toBeVisible();
  await rowButton(page, "shadow").click();

  // The Library: its count and + Variation in the head, in the head's type —
  // sentence case, no letter-spacing.
  await rowButton(page, "library").click();
  const library = popover(page);
  const libraryHead = library.locator(".sidebar-popover-head");
  await expect(libraryHead.locator(".sidebar-popover-count")).toHaveText("8");
  const variation = libraryHead.getByRole("button", { name: "+ Variation" });
  await expect(variation).toBeVisible();
  for (const node of [
    libraryHead.locator(".sidebar-popover-title"),
    variation,
  ]) {
    expect(
      await node.evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.textTransform, style.letterSpacing];
      }),
    ).toEqual(["none", "normal"]);
  }
  // A concept's versions hang in its columns: dots and names line up.
  const concept = library.locator(".library-row.current").first();
  const version = library.locator(".library-row.variation").first();
  const x = async (row: Locator, selector: string) =>
    Math.round((await row.locator(selector).first().boundingBox())!.x);
  expect(await x(version, ".library-dot")).toBe(
    await x(concept, ".library-dot"),
  );
  expect(await x(version, ".library-var-name")).toBe(
    await x(concept, "strong"),
  );

  await page.mouse.move(0, 0);
  const box = (await library.boundingBox())!;
  await page.screenshot({
    path: testInfo.outputPath("sidebar-library-popover.png"),
    clip: {
      x: 0,
      y: Math.max(0, box.y - 24),
      width: box.x + box.width + 24,
      height: box.height + 48,
    },
  });
});
