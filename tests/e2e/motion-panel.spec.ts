import { type Locator, type Page } from "@playwright/test";

import { expect, openBlankEditor, test } from "./fixtures";

/**
 * Motion by type, and lines that open (ADR 0080), the way a Coach meets it on
 * a desktop. Z in Gun Doubles Right is given a jet from his own panel; the
 * row that names it opens a Motion panel of three choices — the type, moving
 * or set at the snap, and a note — with nothing left over from a route's;
 * Moving and Set move where the timeline starts; his slant follows the motion
 * across the formation and goes back to his stance when the motion is taken
 * off; a line clicked on the field brings back a folded inspector; and the
 * alternate's help opens under its row instead of on top of it. The panels
 * and the field are the run's artifacts.
 */

test.use({ viewport: { width: 1440, height: 960 } });

const BREATH_MS = 250;

const inspector = (page: Page) =>
  page.getByRole("complementary", { name: "Play inspector" });

const field = (page: Page) => page.locator("svg.field-diagram").first();

async function gunDoublesRight(page: Page): Promise<void> {
  await openBlankEditor(page);
  await page.keyboard.press("Control+Shift+f");
  const browser = page.getByRole("dialog", { name: "Formations" });
  await expect(browser).toBeVisible();
  await browser.getByText("Gun Doubles Right", { exact: true }).click();
  await expect(browser).toBeHidden();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
}

/** Where a man is drawn on the glass. */
const onGlass = (man: Locator) =>
  man.evaluate((node) => {
    const matrix = (node as SVGGElement).getScreenCTM()!;
    const centre = new DOMPoint(0, 0).matrixTransform(matrix);
    return { x: centre.x, y: centre.y };
  });

const zOf = (page: Page) => page.locator('[aria-label="Z offense player"]');

/** Picks Z on the field, wherever the field has moved him to on the glass. */
async function pickZ(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  const at = await onGlass(zOf(page));
  await page.mouse.click(at.x, at.y);
  await expect(inspector(page).locator(".player-heading")).toBeVisible();
}

/** Where a line starts and ends, in the field's own frame. */
async function endsOf(
  line: Locator,
): Promise<{ start: { x: number; y: number }; end: { x: number; y: number } }> {
  const d = await line
    .locator("path[data-scene-path]")
    .first()
    .getAttribute("d");
  const numbers = (d?.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  return {
    start: { x: numbers[0]!, y: numbers[1]! },
    end: { x: numbers.at(-2)!, y: numbers.at(-1)! },
  };
}

/** Where a man stands, in the field's own frame. */
async function standsAt(man: Locator): Promise<{ x: number; y: number }> {
  const [, x, y] =
    /translate\(([-\d.]+)[ ,]+([-\d.]+)/.exec(
      (await man.getAttribute("transform")) ?? "",
    ) ?? [];
  return { x: Number(x), y: Number(y) };
}

const motion = (page: Page) => page.getByRole("img", { name: /^Z motion/ });
const route = (page: Page) => page.getByRole("img", { name: /^Z route/ });

test("a man is given a motion by type, and its panel is three choices", async ({
  page,
}, testInfo) => {
  await gunDoublesRight(page);
  const panel = inspector(page);
  await pickZ(page);

  // His panel says what he does in the order he does it, and offers the
  // five types where he has no motion yet.
  const add = panel.getByRole("group", { name: "Add a pre-snap motion" });
  await expect(add.getByRole("button")).toHaveText([
    "Jet",
    "Orbit",
    "Across",
    "Return",
    "Shift",
  ]);
  await add.getByRole("button", { name: "Jet" }).click();

  // One press draws it from his stance, toward the ball, and he stays picked
  // with a row that names it in the buttons' place.
  await expect(motion(page)).toHaveCount(1);
  const z = await standsAt(zOf(page));
  const jet = await endsOf(motion(page));
  expect(Math.abs(jet.start.x - z.x)).toBeLessThan(1);
  expect(jet.end.x).toBeLessThan(z.x - 200);
  expect(jet.end.x).toBeGreaterThan(500);
  await expect(add).toHaveCount(0);
  const row = panel.getByRole("button", {
    name: "Edit Jet · moving at the snap",
  });
  await expect(row).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Edit", exact: true }),
  ).toHaveCount(0);
  await panel.screenshot({ path: testInfo.outputPath("1-player-panel.png") });

  // The row is the way in: a Motion panel headed by whose it is and what it
  // is, with the type, the snap and a note.
  await row.click();
  await expect(panel.getByRole("group", { name: "Z — Motion" })).toBeVisible();
  const types = panel.getByRole("group", { name: "Type of motion" });
  const snap = panel.getByRole("group", { name: "At the snap" });
  await expect(types.getByRole("button")).toHaveText([
    "Jet",
    "Orbit",
    "Across",
    "Return",
    "Shift",
  ]);
  await expect(types.getByRole("button", { name: "Jet" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(snap.getByRole("button")).toHaveText(["Moving", "Set"]);
  await expect(snap.getByRole("button", { name: "Moving" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    panel.getByRole("textbox", { name: "Coaching note" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Remove motion" }),
  ).toBeVisible();

  // Nothing left over from a route's panel.
  await expect(panel.getByRole("group", { name: "Kind of line" })).toHaveCount(
    0,
  );
  for (const leftover of ["Appearance", "Advanced", "Flip", "Straighten"]) {
    await expect(panel.getByRole("button", { name: leftover })).toHaveCount(0);
  }
  for (const leftover of ["Assignment", "Read", "Conversion", "Delay"]) {
    await expect(panel.getByRole("textbox", { name: leftover })).toHaveCount(0);
  }
  await expect(panel.locator(".route-heading")).not.toContainText(
    /breaks|zigzag/i,
  );

  // Still moving, he runs right up to the snap; set, he gets his breath
  // before it, so the timeline starts that much earlier.
  const slider = page
    .getByLabel("Playback controls")
    .getByRole("slider", { name: "Scrub the play" });
  const moving = Number(await slider.getAttribute("aria-valuemin"));
  expect(moving).toBeLessThan(-1000);
  await snap.getByRole("button", { name: "Set" }).click();
  await expect(slider).toHaveAttribute(
    "aria-valuemin",
    String(moving - BREATH_MS),
  );
  await snap.getByRole("button", { name: "Moving" }).click();
  await expect(slider).toHaveAttribute("aria-valuemin", String(moving));

  // Another type redraws the one motion he has, and says what it means at
  // the snap: a shift is short, and set.
  await types.getByRole("button", { name: "Shift" }).click();
  await expect(types.getByRole("button", { name: "Shift" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(snap.getByRole("button", { name: "Set" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(motion(page)).toHaveCount(1);
  const shift = await endsOf(motion(page));
  expect(z.x - shift.end.x).toBeGreaterThan(40);
  expect(z.x - shift.end.x).toBeLessThan(140);

  // The note is the one thing he writes, and it prints beside the motion.
  const note = panel.getByRole("textbox", { name: "Coaching note" });
  await note.fill("On the cadence");
  await note.blur();
  await expect(field(page).getByText("On the cadence")).toHaveCount(1);

  await panel.screenshot({ path: testInfo.outputPath("2-motion-panel.png") });
  await field(page).screenshot({ path: testInfo.outputPath("2-shift.png") });
});

test("his route follows the motion, and goes back when it is taken off", async ({
  page,
}, testInfo) => {
  await gunDoublesRight(page);
  const panel = inspector(page);
  await pickZ(page);
  await panel.getByRole("button", { name: "Slant", exact: true }).click();
  await expect(route(page)).toHaveCount(1);
  const z = await standsAt(zOf(page));
  const fromStance = await endsOf(route(page));
  expect(Math.abs(fromStance.start.x - z.x)).toBeLessThan(1);

  // A route cannot be turned into a motion any more: he is given one.
  await panel.getByRole("button", { name: "Edit Route" }).click();
  await expect(panel.getByRole("group", { name: "Z — Route" })).toBeVisible();
  await expect(panel.getByRole("group", { name: "Kind of line" })).toHaveCount(
    0,
  );

  // Across the formation: the slant sets out from where the motion leaves
  // him, the same shape, on the other side of the ball.
  await pickZ(page);
  await panel
    .getByRole("group", { name: "Add a pre-snap motion" })
    .getByRole("button", { name: "Across" })
    .click();
  await expect(motion(page)).toHaveCount(1);
  const across = await endsOf(motion(page));
  expect(across.end.x).toBeLessThan(500);
  // A zigzag's last tooth is drawn on the whole pixel; the route starts on
  // the spot itself.
  await expect
    .poll(async () => {
      const { start } = await endsOf(route(page));
      return Math.hypot(start.x - across.end.x, start.y - across.end.y);
    })
    .toBeLessThan(1);
  const carried = await endsOf(route(page));
  expect(carried.end.x - carried.start.x).toBeCloseTo(
    fromStance.end.x - fromStance.start.x,
    0,
  );
  await field(page).screenshot({
    path: testInfo.outputPath("1-across-with-slant.png"),
  });

  // Both are his: a motion, and a route that is no alternate to it.
  await expect(
    panel.getByRole("button", { name: "Edit Across · set at the snap" }),
  ).toBeVisible();
  await expect(panel.getByRole("button", { name: "Edit Route" })).toBeVisible();
  await expect(
    panel.getByRole("button", { name: /^Edit Alternate/ }),
  ).toHaveCount(0);

  // Taken off with the × on its row, the slant is back on his stance.
  await panel
    .getByRole("button", { name: "Delete Across · set at the snap" })
    .click();
  await expect(motion(page)).toHaveCount(0);
  await expect
    .poll(async () => (await endsOf(route(page))).start)
    .toEqual(fromStance.start);
  expect((await endsOf(route(page))).end).toEqual(fromStance.end);
  await expect(
    panel.getByRole("group", { name: "Add a pre-snap motion" }),
  ).toBeVisible();
  await field(page).screenshot({
    path: testInfo.outputPath("2-slant-back-on-his-stance.png"),
  });
});

test("a line clicked on the field opens its panel, and the alternate's help has a line of its own", async ({
  page,
}, testInfo) => {
  await gunDoublesRight(page);
  const panel = inspector(page);
  await pickZ(page);
  await panel.getByRole("button", { name: "Slant", exact: true }).click();
  await expect(route(page)).toHaveCount(1);

  // Folded, the inspector comes back for a line clicked on its own.
  await page.keyboard.press("Escape");
  await panel.getByRole("button", { name: "Hide the inspector" }).click();
  await expect(panel).toHaveCount(0);
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
  await expect(panel.getByRole("group", { name: "Z — Route" })).toBeVisible();
  // Its own actions each keep to one line.
  const choice = panel.getByRole("button", { name: /^\+ Choice/ });
  expect((await choice.boundingBox())!.height).toBeLessThan(40);

  // A click on the grass puts it down again.
  const grass = await field(page).boundingBox();
  await page.mouse.click(grass!.x + grass!.width / 2, grass!.y + 60);
  await expect(panel.locator(".route-heading")).toHaveCount(0);

  // Another call he could run goes with the route it is an alternate to,
  // above the quick routes rather than at the foot of the panel.
  await pickZ(page);
  const alternate = panel.getByRole("button", { name: "+ Alternate route" });
  const rowBox = (await panel
    .getByRole("button", { name: "Edit Route" })
    .boundingBox())!;
  const before = (await alternate.boundingBox())!;
  const quick = (await panel.getByText("Quick routes").boundingBox())!;
  expect(before.y).toBeGreaterThan(rowBox.y);
  expect(before.y).toBeLessThan(quick.y);

  // Its help opens under the row and leaves the button the width it was.
  await panel
    .getByRole("button", { name: "About alternates and choices" })
    .click();
  const help = panel.getByText(/^An alternate starts over at his stance/);
  await expect(help).toBeVisible();
  const after = (await alternate.boundingBox())!;
  const words = (await help.boundingBox())!;
  expect(after.width).toBeCloseTo(before.width, 0);
  expect(after.height).toBeCloseTo(before.height, 0);
  expect(words.y).toBeGreaterThanOrEqual(after.y + after.height);
  expect(words.width).toBeGreaterThan(after.width);

  await alternate.click();
  await expect(
    panel.getByRole("group", { name: "Z — Alternate 1" }),
  ).toBeVisible();
  await pickZ(page);
  await expect(
    panel.getByRole("button", { name: "Edit Alternate 1" }),
  ).toBeVisible();
  await panel.screenshot({
    path: testInfo.outputPath("route-and-alternate.png"),
  });
});
