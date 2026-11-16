import { type Page } from "@playwright/test";

import { expect, openBlankEditor, test } from "./fixtures";

/**
 * A choice heads upfield unless the Coach drags it somewhere else. X in Gun
 * Doubles Right is given a hitch, which breaks back to the right at its
 * end; the first choice off the end used to keep turning and run back at
 * the line of scrimmage, so the option read as a route going backwards. It
 * now leaves the end heading north, and so does a choice at the top of the
 * stem. The field with both choices is the run's artifact.
 */

test.use({ viewport: { width: 1440, height: 960 } });

const inspector = (page: Page) =>
  page.getByRole("complementary", { name: "Play inspector" });

const route = (page: Page) => page.getByRole("img", { name: /^X route/ });

async function gunDoublesRight(page: Page): Promise<void> {
  await openBlankEditor(page);
  await page.keyboard.press("Control+Shift+f");
  const browser = page.getByRole("dialog", { name: "Formations" });
  await expect(browser).toBeVisible();
  await browser.getByText("Gun Doubles Right", { exact: true }).click();
  await expect(browser).toBeHidden();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
}

async function pickX(page: Page): Promise<void> {
  const at = await page
    .locator('[aria-label="X offense player"]')
    .evaluate((node) => {
      const centre = new DOMPoint(0, 0).matrixTransform(
        (node as SVGGElement).getScreenCTM()!,
      );
      return { x: centre.x, y: centre.y };
    });
  await page.mouse.click(at.x, at.y);
}

/** Clicks a point on the field given in the frame the field is drawn in. */
async function clickFrame(
  page: Page,
  at: { x: number; y: number },
): Promise<void> {
  const client = await page
    .locator("svg.field-diagram")
    .first()
    .evaluate((node, point) => {
      const svg = node as SVGSVGElement;
      const p = new DOMPoint(point.x, point.y).matrixTransform(
        svg.getScreenCTM()!,
      );
      return { x: p.x, y: p.y };
    }, at);
  await page.mouse.click(client.x, client.y);
}

/** The stem's own points, in the field's frame. */
async function stem(page: Page): Promise<{ x: number; y: number }[]> {
  const d = await route(page)
    .locator("path[data-scene-path]:not([data-scene-path*='-branch-'])")
    .first()
    .getAttribute("d");
  const numbers = d!.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const points: { x: number; y: number }[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    points.push({ x: numbers[index]!, y: numbers[index + 1]! });
  }
  return points;
}

/** Where a choice leaves its break and where it ends, in the field's frame. */
async function choice(
  page: Page,
  index: number,
): Promise<{ from: { x: number; y: number }; to: { x: number; y: number } }> {
  const d = await page
    .locator(`[data-scene-path$="-branch-${index}"]`)
    .getAttribute("d");
  const numbers = d!.match(/-?\d+(\.\d+)?/g)!.map(Number);
  return {
    from: { x: numbers[0]!, y: numbers[1]! },
    to: { x: numbers.at(-2)!, y: numbers.at(-1)! },
  };
}

test("a choice off a hitch heads upfield, at the end and at the top", async ({
  page,
}, testInfo) => {
  await gunDoublesRight(page);
  const panel = inspector(page);
  await pickX(page);
  await panel.getByRole("button", { name: "Hitch", exact: true }).click();
  await expect(route(page)).toHaveCount(1);

  // The hitch climbs, then comes back toward the line at its end.
  const points = await stem(page);
  const top = points.reduce((best, point) => (point.y < best.y ? point : best));
  const end = points.at(-1)!;
  expect(end.y).toBeGreaterThan(top.y);

  // Off the end: the choice heads north, away from the line.
  await clickFrame(page, {
    x: (top.x + end.x) / 2,
    y: (top.y + end.y) / 2,
  });
  await panel.getByRole("button", { name: "+ Choice at the end" }).click();
  const offEnd = await choice(page, 0);
  expect(Math.abs(offEnd.from.x - end.x)).toBeLessThan(1);
  expect(offEnd.to.y).toBeLessThan(offEnd.from.y);

  // At the top of the stem: north again, not back down after the hitch.
  await clickFrame(page, {
    x: (top.x + end.x) / 2,
    y: (top.y + end.y) / 2,
  });
  const topHandle = page.locator('[data-node-handle="1"]');
  await expect(topHandle).toHaveCount(1);
  const handle = (await topHandle.boundingBox())!;
  await page.mouse.click(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  const atBreak = panel.getByRole("button", { name: /^\+ Choice at/ });
  await expect(atBreak).not.toHaveText(/end/);
  await atBreak.click();
  const atTop = await choice(page, 1);
  const topNow = (await stem(page))[1]!;
  expect(Math.abs(atTop.from.x - topNow.x)).toBeLessThan(1);
  expect(Math.abs(atTop.from.y - topNow.y)).toBeLessThan(1);
  expect(atTop.to.y).toBeLessThan(atTop.from.y);

  await page.keyboard.press("Escape");
  await expect(page.locator(".toast")).toHaveCount(0, { timeout: 10_000 });
  await page
    .locator("svg.field-diagram")
    .first()
    .screenshot({ path: testInfo.outputPath("hitch-choices-head-north.png") });
});
