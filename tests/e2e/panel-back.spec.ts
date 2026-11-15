import { type Page } from "@playwright/test";

import { expect, openBlankEditor, test } from "./fixtures";

/**
 * A panel's back arrow goes back the way the Coach came. Z in Gun Doubles
 * Right is picked on the field and given a slant; the slant, clicked on the
 * field, opens its Route panel. Back from there is Z's panel — not the
 * roster — and back from Z's panel is the roster. A man picked with nothing
 * before him still goes straight back to the play. Z's panel, reached by the
 * back arrow, is the run's artifact.
 */

test.use({ viewport: { width: 1440, height: 960 } });

const inspector = (page: Page) =>
  page.getByRole("complementary", { name: "Play inspector" });

const route = (page: Page) => page.getByRole("img", { name: /^Z route/ });

async function gunDoublesRight(page: Page): Promise<void> {
  await openBlankEditor(page);
  await page.keyboard.press("Control+Shift+f");
  const browser = page.getByRole("dialog", { name: "Formations" });
  await expect(browser).toBeVisible();
  await browser.getByText("Gun Doubles Right", { exact: true }).click();
  await expect(browser).toBeHidden();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
}

/** Picks Z on the field. */
async function pickZ(page: Page): Promise<void> {
  const at = await page
    .locator('[aria-label="Z offense player"]')
    .evaluate((node) => {
      const centre = new DOMPoint(0, 0).matrixTransform(
        (node as SVGGElement).getScreenCTM()!,
      );
      return { x: centre.x, y: centre.y };
    });
  await page.mouse.click(at.x, at.y);
}

/** Clicks Z's route on the field, most of the way along it. */
async function clickZRoute(page: Page): Promise<void> {
  const along = await route(page)
    .locator("path[data-scene-path]")
    .first()
    .evaluate((node) => {
      const path = node as SVGPathElement;
      const point = path.getPointAtLength(path.getTotalLength() * 0.7);
      const at = new DOMPoint(point.x, point.y).matrixTransform(
        path.getScreenCTM()!,
      );
      return { x: at.x, y: at.y };
    });
  await page.mouse.click(along.x, along.y);
}

test("back from a man's route goes to the man, then to the roster", async ({
  page,
}, testInfo) => {
  await gunDoublesRight(page);
  const panel = inspector(page);
  const zPanel = panel.locator(".player-heading");
  const routePanel = panel.getByRole("group", { name: "Z — Route" });
  const roster = panel.locator(".assignments-count");

  // Picked on his own, with nothing before him: back is the play.
  await pickZ(page);
  await expect(zPanel).toBeVisible();
  await expect(
    zPanel.getByRole("button", { name: "Back to the play" }),
  ).toBeVisible();

  // Given a slant, then the slant picked on the field.
  await panel.getByRole("button", { name: "Slant", exact: true }).click();
  await expect(route(page)).toHaveCount(1);
  await clickZRoute(page);
  await expect(routePanel).toBeVisible();

  // Back from the route is Z's panel, not the roster.
  await routePanel.getByRole("button", { name: "Back to Z" }).click();
  await expect(routePanel).toHaveCount(0);
  await expect(zPanel).toBeVisible();
  await expect(roster).toHaveCount(0);
  await expect(
    zPanel.getByRole("button", { name: "Back to the play" }),
  ).toBeVisible();
  // The toast times out, so the artifact is the same on every run.
  await expect(page.locator(".toast")).toHaveCount(0, { timeout: 10_000 });
  await page.screenshot({ path: testInfo.outputPath("back-to-z.png") });

  // Back again is the roster.
  await zPanel.getByRole("button", { name: "Back to the play" }).click();
  await expect(zPanel).toHaveCount(0);
  await expect(panel.locator(".route-heading")).toHaveCount(0);
  await expect(roster).toBeVisible();

  // Esc from a route is still the play, however the Coach got there.
  await pickZ(page);
  await clickZRoute(page);
  await expect(routePanel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(routePanel).toHaveCount(0);
  await expect(zPanel).toHaveCount(0);
});
