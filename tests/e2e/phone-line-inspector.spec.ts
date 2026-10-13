import { type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * A picked line's inspector offers only what that line can be: a receiver's
 * route is a route and nothing else — a motion is given to the man, not made
 * out of his route (ADR 0080) — a back's line can carry the ball, and a
 * lineman's block has no kind to change and no read, conversion or choice.
 * A motion's sheet is its three choices: the type, moving or set, and a
 * note. The sheets on X's route and on his motion are the run's artifacts.
 */

/** A point part way along a drawn line, on the glass. */
const alongLine = (page: Page, id: string) =>
  page.evaluate((id) => {
    const path = document.querySelector<SVGPathElement>(
      `path[data-scene-path='${id}']`,
    );
    const matrix = path?.getScreenCTM();
    if (!path || !matrix) throw new Error(`${id} is not on the field.`);
    const point = path.getPointAtLength(path.getTotalLength() * 0.6);
    const onGlass = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: onGlass.x, y: onGlass.y };
  }, id);

const manOnGlass = (page: Page, id: string) =>
  page.evaluate((id) => {
    const man = document.querySelector<SVGGElement>(
      `[data-scene-player='${id}']`,
    );
    const matrix = man?.getScreenCTM();
    if (!matrix) throw new Error(`${id} is not on the field.`);
    const centre = new DOMPoint(0, 0).matrixTransform(matrix);
    return { x: centre.x, y: centre.y };
  }, id);

const tap = async (page: Page, at: { x: number; y: number }) =>
  page.touchscreen.tap(at.x, at.y);

/** Picks a line on the field and pulls the sheet up over it. */
const openLine = async (page: Page, id: string) => {
  await tap(page, await alongLine(page, id));
  await page.getByRole("button", { name: "Show all assignments" }).tap();
};

test.use({ viewport: { width: 390, height: 844 } });

test("offers only the options that fit the picked line", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.locator(".chalk-shell.phone-workspace")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);

  const sheet = page.getByRole("complementary", { name: "Play inspector" });
  const kinds = sheet.getByRole("group", { name: "Kind of line" });
  const showField = page.getByRole("button", { name: "Show the field" });

  // A back's line can be the ball's flight — a pitch or a halfback pass.
  await openLine(page, "rf");
  await expect(kinds.getByRole("button")).toHaveText(["Route", "Ball"]);
  if (await showField.isVisible()) await showField.tap();

  // A lineman's block: no kind to change, no read, no conversion, no choice.
  await tap(page, await manOnGlass(page, "ol2"));
  const tray = page.getByRole("navigation", { name: "Quick calls" });
  await tray.getByRole("button").first().tap();
  // His block is too short to land a finger on beside him, so it is opened
  // from his Blocking row.
  await page.getByRole("button", { name: "Show all assignments" }).tap();
  await sheet.getByRole("button", { name: /^Edit / }).tap();
  await expect(
    sheet.getByRole("textbox", { name: "Assignment" }),
  ).toBeVisible();
  await expect(kinds).toHaveCount(0);
  await expect(sheet.getByRole("textbox", { name: "Read" })).toHaveCount(0);
  await expect(sheet.getByRole("textbox", { name: "Conversion" })).toHaveCount(
    0,
  );
  await expect(sheet.getByRole("button", { name: /^\+ Choice/ })).toHaveCount(
    0,
  );
  if (await showField.isVisible()) await showField.tap();

  // X's route — the screenshot in the report: a route and nothing else, so
  // no kind to pick, with the read, the conversion and the choice it runs on.
  await openLine(page, "rx");
  await expect(kinds).toHaveCount(0);
  await expect(sheet.getByRole("textbox", { name: "Read" })).toBeVisible();
  await expect(
    sheet.getByRole("textbox", { name: "Conversion" }),
  ).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^\+ Choice/ })).toBeVisible();

  await sheet.screenshot({
    path: testInfo.outputPath("route-inspector.png"),
  });

  // His motion is given from his own sheet, by type. Picking one is an
  // option picked, so the sheet drops and the field shows it. He is picked
  // from the roster: on the field his route's first break sits on him.
  await sheet.locator(".sheet-back").tap();
  await sheet.getByRole("button", { name: /^X: / }).tap();
  const add = sheet.getByRole("group", { name: "Add a pre-snap motion" });
  await expect(add.getByRole("button")).toHaveText([
    "Jet",
    "Orbit",
    "Across",
    "Return",
    "Shift",
  ]);
  for (const type of await add.getByRole("button").all()) {
    const box = (await type.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await add.getByRole("button", { name: "Across" }).tap();
  await expect(sheet).toHaveAttribute("data-sheet", "peek");
  await expect(page.getByRole("img", { name: /^X motion/ })).toHaveCount(1);

  // The row that names it opens its sheet: the three choices, and nothing
  // of a route's.
  await page.getByRole("button", { name: "Show all assignments" }).tap();
  await sheet
    .getByRole("button", { name: "Edit Across · set at the snap" })
    .tap();
  const types = sheet.getByRole("group", { name: "Type of motion" });
  const snap = sheet.getByRole("group", { name: "At the snap" });
  await expect(types.getByRole("button", { name: "Across" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(snap.getByRole("button", { name: "Set" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    sheet.getByRole("textbox", { name: "Coaching note" }),
  ).toBeVisible();
  await expect(kinds).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Appearance" })).toHaveCount(
    0,
  );
  await expect(sheet.getByRole("button", { name: "Advanced" })).toHaveCount(0);
  await expect(sheet.getByRole("textbox", { name: "Read" })).toHaveCount(0);

  await sheet.screenshot({
    path: testInfo.outputPath("motion-inspector.png"),
  });
});
