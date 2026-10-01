import { type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * On a phone, the quick tray offers a quarterback a quarterback's calls —
 * drops, play action, the boot, the handoff — rather than the receivers'
 * route tree. Boot right from the tray draws his boot, names it on the field
 * and in the roster. The field after the boot is the run's artifact.
 */

/** Where a man stands on the glass: his own origin through the field's transform. */
const onGlass = (page: Page, id: string) =>
  page.evaluate((id) => {
    const man = document.querySelector<SVGGElement>(
      `[data-scene-player='${id}']`,
    );
    const matrix = man?.getScreenCTM();
    if (!matrix) throw new Error(`${id} is not on the field.`);
    const centre = new DOMPoint(0, 0).matrixTransform(matrix);
    return { x: centre.x, y: centre.y };
  }, id);

test.use({ viewport: { width: 390, height: 664 } });

test("the quick tray gives a quarterback his own calls", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.locator(".chalk-shell.phone-workspace")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);

  const q = await onGlass(page, "q");
  await page.touchscreen.tap(q.x, q.y);
  const tray = page.getByRole("navigation", { name: "Quick calls" });
  await expect(tray).toContainText("Q · Assignments");
  for (const name of ["3-step drop", "5-step drop", "Play action", "Handoff"]) {
    await expect(tray.getByRole("button", { name, exact: true })).toHaveCount(
      1,
    );
  }
  for (const name of ["Slant", "Go", "Corner"]) {
    await expect(tray.getByRole("button", { name, exact: true })).toHaveCount(
      0,
    );
  }

  await tray.getByRole("button", { name: "Boot right", exact: true }).tap();
  await expect(
    page.getByRole("img", { name: "Q route: Boot right" }),
  ).toHaveCount(1);
  await expect(
    tray.getByRole("button", { name: "Boot right", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // The toast times out, so the artifact is the same on every run.
  await expect(page.locator(".toast")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("phone-boot-right.png"),
  });

  const sheet = page.getByRole("complementary", { name: "Play inspector" });
  await page.getByRole("button", { name: "Show all assignments" }).tap();
  await expect(sheet).toHaveAttribute("data-sheet", "full");
  await sheet.getByRole("button", { name: /back to the roster/ }).tap();
  await expect(
    sheet.getByRole("button", { name: "Q: Boot right — Quarterback" }),
  ).toBeVisible();
});
