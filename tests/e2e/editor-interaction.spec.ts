import { expect, test, type Page } from "@playwright/test";

/**
 * Drives real pointer gestures through the production field: the unified
 * input machine behind them must select like the original, commit exactly one
 * undoable transaction per completed gesture, and abandon a cancelled one.
 */

const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 620;

const field = (page: Page) => page.locator("svg.field-diagram").first();

/**
 * Converts frame coordinates to client coordinates, through whatever part of
 * the frame is currently on screen. Reading the camera rather than assuming
 * the whole frame is what lets the same helper work zoomed in.
 */
async function fieldPoint(
  page: Page,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  const element = field(page);
  const box = await element.boundingBox();
  if (!box) throw new Error("The field is not on screen.");
  const [viewX, viewY, viewWidth, viewHeight] = (
    (await element.getAttribute("viewBox")) ??
    `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`
  )
    .split(" ")
    .map(Number) as [number, number, number, number];
  return {
    x: box.x + ((x - viewX) / viewWidth) * box.width,
    y: box.y + ((y - viewY) / viewHeight) * box.height,
  };
}

async function playerCenter(
  page: Page,
  id: string,
): Promise<{ x: number; y: number }> {
  const transform = await page
    .locator(`[data-scene-player="${id}"]`)
    .getAttribute("transform");
  const match = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(transform ?? "");
  if (!match) throw new Error(`Player ${id} has no position.`);
  return fieldPoint(page, Number(match[1]), Number(match[2]));
}

/**
 * Where a man stands on the field, in the frame the field is drawn in. Client
 * pixels move when a panel grows and the field reflows around it; these do
 * not, so they are what to compare a Play against itself with.
 */
async function playerAt(
  page: Page,
  id: string,
): Promise<{ x: number; y: number }> {
  const transform = await page
    .locator(`[data-scene-player="${id}"]`)
    .getAttribute("transform");
  const match = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(transform ?? "");
  if (!match) throw new Error(`Player ${id} has no position.`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

async function openEditor(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
}

test("drags a Player and his route as one undoable step", async ({ page }) => {
  await openEditor(page);

  const before = await page
    .locator('[data-scene-player="x"]')
    .getAttribute("transform");
  const routeBefore = await page
    .locator('[data-scene-path="rx"]')
    .getAttribute("d");

  const start = await playerCenter(page, "x");
  await drag(page, start, { x: start.x + 50, y: start.y + 30 });

  await expect(page.locator('[data-scene-player="x"]')).not.toHaveAttribute(
    "transform",
    before!,
  );
  // The route came along with the man running it.
  await expect(page.locator('[data-scene-path="rx"]')).not.toHaveAttribute(
    "d",
    routeBefore!,
  );
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();

  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toHaveAttribute("title", "Undo Move Player");
  await undo.click();
  await expect(page.locator('[data-scene-player="x"]')).toHaveAttribute(
    "transform",
    before!,
  );
  await expect(page.locator('[data-scene-path="rx"]')).toHaveAttribute(
    "d",
    routeBefore!,
  );
});

test("marquee selects the line and deletes it as one step", async ({
  page,
}) => {
  await openEditor(page);

  // A rectangle of empty grass around the five offensive linemen. It starts
  // well clear of the nearest of them, because a finger is owed forty-four
  // pixels of him and on a tablet that is a good deal of the frame.
  await drag(
    page,
    await fieldPoint(page, 400, 400),
    await fieldPoint(page, 600, 458),
  );
  await expect(page.locator("[data-scene-player].selected")).toHaveCount(5);

  await page.keyboard.press("Backspace");
  await expect(page.locator("[data-scene-player]")).toHaveCount(6);

  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toHaveAttribute("title", "Undo Delete Players");
  await undo.click();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
});

test("Escape abandons a drag; arrows nudge as their keyboard alternative", async ({
  page,
}) => {
  await openEditor(page);

  const before = await page
    .locator('[data-scene-player="q"]')
    .getAttribute("transform");
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toBeDisabled();

  const start = await playerCenter(page, "q");
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y - 40, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.up();

  await expect(page.locator('[data-scene-player="q"]')).toHaveAttribute(
    "transform",
    before!,
  );
  await expect(undo).toBeDisabled();

  // The keyboard route to the same move: select, then nudge.
  await page.mouse.click(start.x, start.y);
  await expect(page.locator('[data-scene-player="q"]')).toHaveClass("selected");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-scene-player="q"]')).not.toHaveAttribute(
    "transform",
    before!,
  );
  await expect(undo).toHaveAttribute("title", "Undo Move Player");
});

test("draws a route with the route tool and commits it once", async ({
  page,
}) => {
  await openEditor(page);
  await expect(page.locator("[data-scene-path]")).toHaveCount(6);

  await page.getByRole("button", { name: "Route — R" }).click();
  const start = await playerCenter(page, "q");

  // Start on the Quarterback, break downfield, then out. The preview is
  // measured by its path data: a straight vertical line has no bounding box,
  // so visibility would say "hidden" about a preview that is drawing fine.
  await page.mouse.click(start.x, start.y);
  const preview = page.locator("[data-drawing-preview]");
  // The stem starts on the Quarterback. The live overlay may round the
  // cursor by a fraction of a pixel, so this is the start, not the exact
  // string of both ends.
  await expect(preview).toHaveAttribute("d", /^M 500 478 L 500 /);

  await page.mouse.move(start.x, start.y - 60);
  // Snap constrains the break to a 45 degree family member — here straight
  // downfield, so the preview keeps the Quarterback's lateral position.
  await expect(preview).toHaveAttribute("d", /^M 500 478 L 500 \d/);
  await page.mouse.click(start.x, start.y - 60);
  await page.mouse.click(start.x + 70, start.y - 60);
  await page.keyboard.press("Enter");

  await expect(page.locator("[data-drawing-preview]")).toHaveCount(0);
  await expect(page.locator("[data-scene-path]")).toHaveCount(7);
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();

  // Finishing hands the select tool back, the way the original does.
  await expect(page.getByRole("button", { name: "Select — V" })).toHaveClass(
    /active/,
  );

  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toHaveAttribute("title", "Undo Draw route");
  await undo.click();
  await expect(page.locator("[data-scene-path]")).toHaveCount(6);
});

test("draws from the blue dot and abandons a route on Escape", async ({
  page,
}) => {
  await openEditor(page);

  // Selecting a Player offers his draw-a-route dot.
  const start = await playerCenter(page, "q");
  await page.mouse.click(start.x, start.y);
  const dot = page.locator('[data-route-dot="q"]');
  await expect(dot).toBeVisible();

  await dot.click();
  await expect(page.locator("[data-drawing-preview]")).toHaveCount(1);
  await page.mouse.move(start.x, start.y - 50);
  await page.mouse.click(start.x, start.y - 50);

  // Escape abandons it: no route, no transaction, nothing to undo.
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-drawing-preview]")).toHaveCount(0);
  await expect(page.locator("[data-scene-path]")).toHaveCount(6);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("edits a route through its handles", async ({ page }) => {
  await openEditor(page);

  // Selecting a route raises its handles; nothing else on the field does.
  await expect(page.locator("[data-node-handle]")).toHaveCount(0);
  const routeBefore = (await page
    .locator('[data-scene-path="rz"]')
    .getAttribute("d"))!;

  // Z's stem runs straight downfield at x 886, from y 452 up to 296.
  const zStem = await fieldPoint(page, 886, 374);
  await page.mouse.click(zStem.x, zStem.y);
  await expect(page.locator("[data-node-handle]")).toHaveCount(2);

  // Drag the end break out and down.
  const endHandle = page.locator('[data-node-handle="1"]');
  const box = (await endHandle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 - 60,
    box.y + box.height / 2 + 40,
    {
      steps: 4,
    },
  );
  await page.mouse.up();

  await expect(page.locator('[data-scene-path="rz"]')).not.toHaveAttribute(
    "d",
    routeBefore,
  );
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toHaveAttribute("title", "Undo Move route break");
  await undo.click();
  await expect(page.locator('[data-scene-path="rz"]')).toHaveAttribute(
    "d",
    routeBefore,
  );
});

test("bends a segment with its curve handle", async ({ page }) => {
  await openEditor(page);

  const before = (await page
    .locator('[data-scene-path="rz"]')
    .getAttribute("d"))!;
  expect(before).not.toContain(" Q ");

  const zStem = await fieldPoint(page, 886, 374);
  await page.mouse.click(zStem.x, zStem.y);
  await expect(page.locator("[data-node-handle]")).toHaveCount(2);

  const curve = page.locator('[data-control-handle="1"]');
  const box = (await curve.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, {
    steps: 4,
  });
  await page.mouse.up();

  // A bent segment is drawn as a quadratic, which a straight one never is.
  await expect(page.locator('[data-scene-path="rz"]')).toHaveAttribute(
    "d",
    /Q/,
  );
  await expect(page.getByRole("button", { name: "Undo" })).toHaveAttribute(
    "title",
    "Undo Curve segment",
  );
});

test("writes a note with the text tool and types over it", async ({ page }) => {
  await openEditor(page);
  await expect(page.locator("[data-scene-label]")).toHaveCount(12);

  await page.getByRole("button", { name: "Text — T" }).click();
  const spot = await fieldPoint(page, 700, 200);
  await page.mouse.click(spot.x, spot.y);

  // The note appears and the Coach is already typing into it.
  await expect(page.locator("[data-scene-label]")).toHaveCount(13);
  const text = page.getByRole("textbox", { name: "Label text" });
  await expect(text).toBeFocused();
  await expect(text).toHaveValue("5 Yds");
  // The tool handed itself back so the note can be moved.
  await expect(page.getByRole("button", { name: "Select — V" })).toHaveClass(
    /active/,
  );

  await page.keyboard.type("MAX SPLIT");
  await expect(text).toHaveValue("MAX SPLIT");
  // The note on the field carries the words, not just the input.
  await expect(page.locator("svg.field-diagram")).toContainText("MAX SPLIT");
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();

  // Every keystroke is one entry, so a single undo removes the whole word.
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toHaveAttribute("title", "Undo Edit label");
  await undo.click();
  await expect(page.getByRole("textbox", { name: "Label text" })).toHaveValue(
    "5 Yds",
  );
});

test("gives a note its meaning and takes it away again", async ({ page }) => {
  await openEditor(page);

  // Selecting an existing note opens the Text panel in place of the idle one.
  await expect(page.getByText("Formation", { exact: true })).toBeVisible();
  const note = page.locator('[data-scene-label="l2"]');
  const box = (await note.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.getByRole("textbox", { name: "Label text" })).toHaveValue(
    "2-3 Yds",
  );
  await expect(page.getByText("Formation", { exact: true })).toBeHidden();

  await page.getByRole("button", { name: "Alert", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Alert", exact: true }),
  ).toHaveClass(/active/);
  // An Alert is red, boxed, and shouted.
  await expect(page.locator('[data-scene-label="l2"] text')).toHaveAttribute(
    "fill",
    "#E5484D",
  );

  // Escape steps back to the play and the idle panels return.
  await page.keyboard.press("Escape");
  await expect(page.getByText("Formation", { exact: true })).toBeVisible();
});

test("copies a Player and pastes him as a new one", async ({ page }) => {
  await openEditor(page);

  const start = await playerCenter(page, "q");
  await page.mouse.click(start.x, start.y);
  await expect(page.locator('[data-scene-player="q"]')).toHaveClass("selected");

  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");

  await expect(page.locator("[data-scene-player]")).toHaveCount(12);
  // The original stayed where he was; the copy is selected, not him.
  await expect(page.locator('[data-scene-player="q"]')).not.toHaveClass(
    "selected",
  );
  await expect(page.locator("[data-scene-player].selected")).toHaveCount(1);

  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toHaveAttribute("title", "Undo Paste");
  await undo.click();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
});

test("mirrors the whole Play and back again from the More menu", async ({
  page,
}) => {
  await openEditor(page);

  const before = (await page
    .locator('[data-scene-player="z"]')
    .getAttribute("transform"))!;
  const routeBefore = (await page
    .locator('[data-scene-path="rz"]')
    .getAttribute("d"))!;

  await page.getByTitle("More actions").click();
  await page.getByRole("button", { name: "Mirror", exact: true }).click();

  await expect(page.locator('[data-scene-player="z"]')).not.toHaveAttribute(
    "transform",
    before,
  );
  await expect(page.getByRole("button", { name: "Undo" })).toHaveAttribute(
    "title",
    "Undo Mirror Play",
  );

  // Mirroring twice puts the Play back exactly as it was.
  await page.getByTitle("More actions").click();
  await page.getByRole("button", { name: "Mirror", exact: true }).click();
  await expect(page.locator('[data-scene-player="z"]')).toHaveAttribute(
    "transform",
    before,
  );
  await expect(page.locator('[data-scene-path="rz"]')).toHaveAttribute(
    "d",
    routeBefore,
  );
});

test("narrows to one segment of a route, then to a branch", async ({
  page,
}) => {
  await openEditor(page);

  // X's route bends twice; press its second segment.
  const onSegment = await fieldPoint(page, 262, 405);
  await page.mouse.click(onSegment.x, onSegment.y);
  await expect(page.locator("[data-node-handle]")).toHaveCount(3);
  // The first click takes the route entire — nothing is picked out yet.
  await expect(page.locator("[data-line-highlight]")).toHaveCount(0);

  // Deliberate clicks, not a double click: a quick one is the gesture that
  // inserts a break, so the pause is what tells the two apart.
  await page.waitForTimeout(600);
  await page.mouse.click(onSegment.x, onSegment.y);
  await expect(page.locator('[data-line-highlight="segment"]')).toHaveCount(1);
  // Narrowing edits nothing, so the route still has the breaks it had.
  await expect(page.locator("[data-node-handle]")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();

  // Z carries a branch, whose split shows as a marker on his stem.
  const onStem = await fieldPoint(page, 886, 374);
  await page.mouse.click(onStem.x, onStem.y);
  await expect(page.locator("[data-branch-marker]")).toHaveCount(1);

  // Clicking the branch line itself selects that line, handles and all.
  const onBranch = await fieldPoint(page, 899, 208);
  await page.mouse.click(onBranch.x, onBranch.y);
  await page.waitForTimeout(600);
  await page.mouse.click(onBranch.x, onBranch.y);
  await expect(page.locator('[data-line-highlight="branch"]')).toHaveCount(1);
  // The branch's own break is the only one it offers to move.
  await expect(page.locator("[data-node-handle]")).toHaveCount(1);
});

test("restyles a route, then one segment of it on its own", async ({
  page,
}) => {
  await openEditor(page);

  // Selecting a route opens the Route panel in place of the idle one.
  const onSegment = await fieldPoint(page, 262, 405);
  await page.mouse.click(onSegment.x, onSegment.y);
  await expect(page.getByText("Formation", { exact: true })).toBeHidden();
  // "Route" is both the panel's heading and one of its kind buttons.
  await expect(
    page.locator(".label-heading").getByText("Route", { exact: true }),
  ).toBeVisible();

  // Restyling with nothing picked out takes the whole line.
  await page.getByRole("button", { name: "Dashed" }).click();
  await expect(page.locator('[data-scene-path="rx"]')).toHaveAttribute(
    "stroke-dasharray",
    "8 6",
  );
  await expect(page.getByRole("button", { name: "Undo" })).toHaveAttribute(
    "title",
    "Undo Edit route",
  );

  // Narrowing to a segment and restyling leaves the rest of the line alone.
  // The point is measured again because the panel that opened on selection
  // reflows the workspace, and on the narrower iPad layout that moves the
  // field out from under a coordinate taken before it appeared.
  await page.waitForTimeout(600);
  const onSegmentAgain = await fieldPoint(page, 262, 405);
  await page.mouse.click(onSegmentAgain.x, onSegmentAgain.y);
  await expect(page.locator('[data-line-highlight="segment"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Dotted" }).click();

  // The route is now drawn in pieces, because one leg reads differently
  // from the rest — the renderer splits a line wherever its style changes.
  await expect(page.locator('[data-scene-path^="rx-segment-"]')).toHaveCount(2);
  await expect(
    page.locator('[data-scene-path^="rx-segment-"][stroke-dasharray="2 6"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-scene-path^="rx-segment-"][stroke-dasharray="8 6"]'),
  ).toHaveCount(1);
});

test("clears the concept and leaves the formation standing", async ({
  page,
}) => {
  await openEditor(page);
  const routes = page.locator("[data-scene-path]");
  const routesBefore = await routes.count();
  expect(routesBefore).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Clear a layer" }).click();
  await page.getByRole("button", { name: "Routes", exact: true }).click();

  // The eleven men stay where they are; only their lines come off.
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await expect(routes).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo" })).toHaveAttribute(
    "title",
    "Undo Clear offensive routes",
  );

  // One erasure is one step back.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(routes).toHaveCount(routesBefore);
});

test("greys a Clear that would take nothing", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Clear a layer" }).click();

  // Stick — Thunder is an offensive Play: there is no call on the field to
  // wipe, so the button offering it cannot be pressed.
  await expect(
    page.getByRole("button", { name: "Coverage", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Defense", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Routes", exact: true }),
  ).toBeEnabled();

  // Clearing the offense empties the field, so the Clear that just ran is
  // itself greyed the moment it has nothing left to take.
  await page.getByRole("button", { name: "Offense", exact: true }).click();
  await expect(page.locator("[data-scene-player]")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear a layer" }).click();
  await expect(
    page.getByRole("button", { name: "Offense", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "All", exact: true }),
  ).toBeDisabled();
});

test("says what a route is for, and prints it at the end of the line", async ({
  page,
}) => {
  await openEditor(page);

  const onSegment = await fieldPoint(page, 262, 405);
  await page.mouse.click(onSegment.x, onSegment.y);
  await expect(
    page.locator(".label-heading").getByText("Route", { exact: true }),
  ).toBeVisible();

  // The read number and the Assignment print on the field.
  // Each field is finished before the next is started, which is what typing
  // coalescing until the Coach leaves the field he is in actually describes —
  // and what a person does. Setting three boxes with no gap between them is a
  // harness trick rather than a gesture, and it races the controlled input.
  const write = async (box: string, value: string) => {
    const field = page.getByRole("textbox", { name: box });
    await field.fill(value);
    await field.blur();
  };
  await write("Assignment", "Stick");
  await write("Conversion", "vs man: fade");
  await write("Read", "2");

  // Four fields typed one after another are four saves, and each one has to
  // land before the mark it draws appears. Under a full suite on a slower
  // browser that queue has been seen to outlast the default wait, so these
  // are given room rather than left to be flaky.
  const committed = { timeout: 15_000 };
  await expect(page.locator('[data-scene-read="rx-read"]')).toHaveCount(
    1,
    committed,
  );
  await expect(
    page.locator('[data-scene-coaching="rx-assignment"]'),
  ).toHaveText("STICK", committed);
  await expect(
    page.locator('[data-scene-coaching="rx-conversion"]'),
  ).toHaveText("vs man: fade", committed);

  // The words survive being read back, which is the whole promise: they ride
  // along with the route rather than living in the panel.
  await page.reload();
  await expect(
    page.locator('[data-scene-coaching="rx-assignment"]'),
  ).toHaveText("STICK");
  await expect(page.locator('[data-scene-read="rx-read"]')).toHaveCount(1);

  // Measured again: the panel closed on reload, and the wider field it left
  // behind puts the segment somewhere else.
  const onSegmentAgain = await fieldPoint(page, 262, 405);
  await page.mouse.click(onSegmentAgain.x, onSegmentAgain.y);
  await expect(page.getByRole("textbox", { name: "Assignment" })).toHaveValue(
    "Stick",
  );
  await expect(page.getByRole("textbox", { name: "Read" })).toHaveValue("2");
});

test("takes the wording off a route when the Coach empties it", async ({
  page,
}) => {
  await openEditor(page);
  const onSegment = await fieldPoint(page, 262, 405);
  await page.mouse.click(onSegment.x, onSegment.y);

  const assignment = page.getByRole("textbox", { name: "Assignment" });
  await assignment.fill("Stick");
  await assignment.blur();
  await expect(
    page.locator('[data-scene-coaching="rx-assignment"]'),
  ).toHaveText("STICK");

  await assignment.fill("");
  await assignment.blur();
  await expect(
    page.locator('[data-scene-coaching="rx-assignment"]'),
  ).toHaveCount(0);
  // The mark leaving the field cannot tell an emptied Assignment from a
  // removed one, because both stop it drawing. What the Coach can undo says
  // which happened: emptying the words takes the whole Assignment with them.
  await expect(page.getByRole("button", { name: "Undo" })).toHaveAttribute(
    "title",
    "Undo Delete Assignment",
  );
});

test("gives a man a second line off his stance and keeps the first", async ({
  page,
}) => {
  await openEditor(page);

  const x = await playerCenter(page, "x");
  await page.mouse.click(x.x, x.y);
  await expect(
    page.locator(".label-heading").getByText("Player", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".line-row")).toHaveCount(1);
  await expect(page.locator(".line-row span").first()).toHaveText(
    "Base stem · solid",
  );

  await page.getByRole("button", { name: "+ Alternate route" }).click();

  // He now has two, the new one dotted and named as the alternate it is, and
  // the panel has followed the Coach onto it. The seeded Play draws six lines
  // already — five stems and the choice off Z's.
  await expect(page.locator("[data-scene-path]")).toHaveCount(7);
  await expect(
    page.locator(".label-heading").getByText("Route", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  // Measured again: closing the panel reflows the field, so the point he was
  // standing on a moment ago is somewhere else now.
  const xAgain = await playerCenter(page, "x");
  await page.mouse.click(xAgain.x, xAgain.y);
  await expect(page.locator(".line-row")).toHaveCount(2);
  await expect(page.locator(".line-row span").nth(1)).toHaveText(
    "Alternate 1 · dotted",
  );

  // One press, one undo entry.
  await expect(page.getByRole("button", { name: "Undo" })).toHaveAttribute(
    "title",
    "Undo Add alternate route",
  );
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("[data-scene-path]")).toHaveCount(6);
});

test("forks a stem into a choice and takes it away again", async ({ page }) => {
  await openEditor(page);

  const onSegment = await fieldPoint(page, 262, 405);
  await page.mouse.click(onSegment.x, onSegment.y);
  await expect(
    page.locator(".label-heading").getByText("Route", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "+ Choice at" }).click();

  // The fork is drawn on the field, and the Coach is narrowed onto it — which
  // is what puts the way back within reach.
  await expect(page.locator('[data-scene-path="rx-branch-0"]')).toHaveCount(1);
  const remove = page.getByRole("button", { name: "Remove this choice" });
  await expect(remove).toBeVisible();

  await remove.click();
  await expect(page.locator('[data-scene-path="rx-branch-0"]')).toHaveCount(0);
  await expect(remove).toBeHidden();
});

test("turns every line a man has the other way, in one step", async ({
  page,
}) => {
  await openEditor(page);

  const tipOf = async () => {
    const d = await page.locator('[data-scene-path="rx"]').getAttribute("d");
    return Number(d!.split(" ").at(-2));
  };
  const before = await tipOf();

  const x = await playerCenter(page, "x");
  await page.mouse.click(x.x, x.y);
  await page.getByRole("button", { name: "Flip his routes" }).click();

  // X breaks in to the middle of the field; flipped, the same route breaks out.
  const flipped = await tipOf();
  expect(flipped).toBeGreaterThan(before);

  await page.getByRole("button", { name: "Undo" }).click();
  expect(await tipOf()).toBeCloseTo(before, 3);
});

test("opens the menu on a route with a right-click and deletes it", async ({
  page,
}) => {
  await openEditor(page);
  await expect(page.locator("[data-scene-path]")).toHaveCount(6);

  const onSegment = await fieldPoint(page, 262, 405);
  await page.mouse.click(onSegment.x, onSegment.y, { button: "right" });

  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  // The route was picked by the asking, so the panel is about it too.
  await expect(
    page.locator(".label-heading").getByText("Route", { exact: true }),
  ).toBeVisible();

  await menu.getByRole("button", { name: "Delete" }).click();
  await expect(menu).toBeHidden();
  await expect(page.locator("[data-scene-path]")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Undo" })).toHaveAttribute(
    "title",
    "Undo Delete route",
  );
});

test("greys what a man cannot be sent behind, and closes on Escape", async ({
  page,
}) => {
  await openEditor(page);

  const q = await playerCenter(page, "q");
  await page.mouse.click(q.x, q.y, { button: "right" });

  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  // A Player draws above every line whatever order he is stored in, so there
  // is nothing for these two to do and no number to grey them from but that.
  await expect(
    menu.getByRole("button", { name: "Bring forward" }),
  ).toBeDisabled();
  await expect(menu.getByRole("button", { name: "Send back" })).toBeDisabled();
  await expect(menu.getByRole("button", { name: "Duplicate" })).toBeEnabled();

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  // Escape closed the menu and left what he had picked alone.
  await expect(
    page.locator(".label-heading").getByText("Player", { exact: true }),
  ).toBeVisible();
});

test("brings a line forward from the menu and from the keyboard", async ({
  page,
}) => {
  await openEditor(page);
  const drawnOrder = () =>
    page
      .locator("[data-scene-path]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-scene-path")),
      );
  expect(await drawnOrder()).toEqual([
    "rx",
    "rf",
    "ry",
    "rh",
    "rz",
    "rz-branch-0",
  ]);

  const onX = await fieldPoint(page, 262, 405);
  await page.mouse.click(onX.x, onX.y, { button: "right" });
  await page
    .getByRole("menu")
    .getByRole("button", { name: "Bring forward" })
    .click();
  expect((await drawnOrder())[1]).toBe("rx");

  // The same step from the keyboard, which is what ADR 0016 asks of anything
  // a pointer alone can reach.
  await page.keyboard.press("Meta+]");
  expect((await drawnOrder())[2]).toBe("rx");
  await page.keyboard.press("Meta+[");
  expect((await drawnOrder())[1]).toBe("rx");
});

test("opens the same menu on a press held still", async ({ page }) => {
  await openEditor(page);

  const z = await playerCenter(page, "z");
  // Twenty units off his centre, measured in the frame the hit tolerances are
  // measured in rather than in screen pixels, which the field scales.
  const beside = await (async () => {
    const transform = await page
      .locator('[data-scene-player="z"]')
      .getAttribute("transform");
    const match = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(transform ?? "")!;
    return fieldPoint(page, Number(match[1]) + 20, Number(match[2]));
  })();
  const field = page.locator("svg.field-diagram").first();
  const menu = page.getByRole("menu");
  const press = (type: string, at: { x: number; y: number }) =>
    field.dispatchEvent(type, {
      pointerId: 7,
      pointerType: "touch",
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      isPrimary: true,
      clientX: at.x,
      clientY: at.y,
    });

  // A press that lets go is a tap, and picks him without offering anything.
  await press("pointerdown", z);
  await press("pointerup", z);
  await expect(
    page.locator(".label-heading").getByText("Player", { exact: true }),
  ).toBeVisible();
  // Waited out rather than checked at once: what is being tested is a timer,
  // and a menu that has not appeared yet looks exactly like one that never will.
  await page.waitForTimeout(700);
  await expect(menu).toBeHidden();

  // Held still, the same press becomes the menu — the touch answer to a
  // right-click, which a device with no right button cannot otherwise reach.
  // Pressed twenty pixels off his centre, which is inside what a finger is
  // allowed everywhere else and outside what a mouse is: the menu must not be
  // the one thing on the field a touch has to be accurate to open.
  await press("pointerdown", beside);
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: "Duplicate" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await press("pointerup", z);
  await expect(menu).toBeHidden();

  // A press that travels is a drag, and a man being moved must not have a
  // menu open under him half way.
  await press("pointerdown", z);
  await field.dispatchEvent("pointermove", {
    pointerId: 7,
    pointerType: "touch",
    buttons: 1,
    isPrimary: true,
    clientX: z.x - 40,
    clientY: z.y - 40,
  });
  await page.waitForTimeout(700);
  await expect(menu).toBeHidden();
});

test("puts the men in another set, carries their routes, and takes it all back at once", async ({
  page,
}) => {
  await openEditor(page);
  const before = await playerAt(page, "z");
  const routes = await page.locator("[data-scene-path]").count();

  await page.getByTitle("Browse formations — ⇧⌘F").click();
  const browser = page.getByRole("dialog", { name: "Formations" });
  await expect(browser).toBeVisible();

  // Narrowing is how a Coach finds a set. Typing is the other way, and the
  // two trips sets are the only ones that answer to it.
  await browser
    .getByRole("textbox", { name: "Search formations" })
    .fill("trips");
  await expect(browser.getByText("Gun Trips Right")).toBeVisible();
  await expect(browser.getByText("Gun Doubles Right")).toBeHidden();

  await browser.getByText("Gun Trips Right", { exact: true }).click();
  await expect(browser).toBeHidden();

  // Trips wants exactly the positions this Play already has, so nobody is
  // added and nobody is left over — the men move and their routes go along.
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await expect(page.locator("[data-scene-path]")).toHaveCount(routes);
  const after = await playerAt(page, "z");
  expect(Math.abs(after.x - before.x)).toBeGreaterThan(1);

  // Said where he is already looking, with one undo within reach.
  const toast = page.getByRole("status");
  await expect(toast).toContainText("Gun Trips Right");
  await expect(toast).toContainText("carried");

  await toast.getByRole("button", { name: "Undo" }).click();
  // Polled rather than read once: the undo is a transaction like any other,
  // so it lands a moment after the press that asked for it.
  await expect
    .poll(async () => Math.abs((await playerAt(page, "z")).x - before.x))
    .toBeLessThan(0.5);
  await expect(page.locator("[data-scene-path]")).toHaveCount(routes);
});

test("brings on the man a set needs, and leaves the one it has no place for", async ({
  page,
}) => {
  await openEditor(page);

  // Gun Spread plays two slots where this Play has a slot and a tight end, so
  // one man is brought on for the empty slot and the tight end stays where he
  // is rather than being made into something he is not.
  await page.getByTitle("Browse formations — ⇧⌘F").click();
  const browser = page.getByRole("dialog", { name: "Formations" });
  await browser.getByRole("button", { name: "10", exact: true }).click();
  await expect(browser.getByText("Gun Trips Right")).toBeHidden();
  await browser.getByText("Gun Spread Right", { exact: true }).click();

  await expect(page.locator("[data-scene-player]")).toHaveCount(12);
  const toast = page.getByRole("status");
  await expect(toast).toContainText("1 added");
  await expect(toast).toContainText("1 left in place");

  // A man brought on is the one thing the Coach did not draw himself, so the
  // set hands him over ready to adjust rather than leaving him to be found.
  await expect(
    page.locator(".label-heading").getByText("Player", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Letter" })).toHaveValue("A");

  // All of it — the move, the man brought on — is one step back.
  await page.keyboard.press("Control+z");
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
});

test("names the set on the field, and shows where another one would put the men", async ({
  page,
}) => {
  await openEditor(page);
  const picker = page.getByTitle("Browse formations — ⇧⌘F");

  // The seeded Play was drawn out of its set — the X is in tight, the back is
  // split out — so it is nobody's stock alignment, and the panel says so
  // rather than naming the nearest thing.
  await expect(picker).toContainText("Custom alignment");

  await page.keyboard.press("Control+Shift+f");
  const browser = page.getByRole("dialog", { name: "Formations" });
  await expect(browser).toBeVisible();
  await expect(page.locator("[data-formation-ghost]")).toHaveCount(0);

  // Reading the picture is the point of the card, and the ghost is that
  // reading laid over what is already there.
  await browser.getByText("Empty Right").hover();
  const ghost = page.locator('[data-formation-ghost="formation_empty_right"]');
  await expect(ghost).toBeVisible();
  await expect(ghost.locator("circle")).toHaveCount(11);

  // Taking one names it: the panel reads the set off the men, and the browser
  // marks the card the Coach is standing in.
  await browser.getByText("Empty Right").click();
  await expect(picker).toContainText("Empty Right");
  await expect(page.locator("[data-formation-ghost]")).toHaveCount(0);

  await page.keyboard.press("Control+Shift+f");
  await expect(
    page.getByRole("dialog", { name: "Formations" }).locator(".on-field"),
  ).toContainText("Empty Right");
  await page.keyboard.press("Escape");
  await expect(browser).toBeHidden();
});

test("puts a call on the field as an alignment, then again with what each man has to do", async ({
  page,
}) => {
  await openEditor(page);
  const routes = await page.locator("[data-scene-path]").count();

  await page.keyboard.press("Control+Shift+d");
  const browser = page.getByRole("dialog", { name: "Defenses" });
  await expect(browser).toBeVisible();

  // A front and a coverage are the two ways a call is found, and picking a
  // front regroups the rest by coverage rather than by the front again.
  await browser.getByRole("button", { name: "Nickel", exact: true }).click();
  await expect(browser.getByText("4-3 Cover 3")).toBeHidden();
  await expect(browser.getByText("Nickel Cover 2")).toBeVisible();

  // Alignment only to begin with, as the original has it.
  const toggle = browser.getByRole("button", { name: "With assignments" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await browser.getByText("Nickel Cover 2", { exact: true }).click();

  await expect(page.locator("[data-scene-player]")).toHaveCount(22);
  await expect(page.locator("[data-scene-path]")).toHaveCount(routes);
  await expect(page.getByRole("status")).toContainText("alignment only");
  await expect(page.getByTitle("Browse defenses — ⇧⌘D")).toContainText(
    "Nickel Cover 2",
  );

  // Asked for again with the assignments on, the same call arrives drawing
  // itself — and replaces the alignment rather than standing beside it.
  await page.keyboard.press("Control+Shift+d");
  await browser.getByRole("button", { name: "With assignments" }).click();
  await browser.getByText("Nickel Cover 2", { exact: true }).click();
  await expect(page.locator("[data-scene-player]")).toHaveCount(22);
  await expect(page.locator("[data-scene-path]")).toHaveCount(routes + 7);
  await expect(page.getByRole("status")).toContainText(
    "alignment and assignments",
  );

  // All of it — the men and every line they draw — is one step back.
  await page.keyboard.press("Control+z");
  await expect(page.locator("[data-scene-path]")).toHaveCount(routes);
});

test("swaps one call for another without leaving the last one underneath", async ({
  page,
}) => {
  await openEditor(page);
  const routes = await page.locator("[data-scene-path]").count();

  const pick = async (name: string) => {
    await page.keyboard.press("Control+Shift+d");
    const browser = page.getByRole("dialog", { name: "Defenses" });
    await expect(browser).toBeVisible();
    await browser.getByRole("textbox").fill(name);
    await browser.getByText(name, { exact: true }).click();
    await expect(browser).toBeHidden();
  };

  // Assignments on, so each call brings its own lines and the swap has
  // something to leave behind if it gets this wrong.
  await page.keyboard.press("Control+Shift+d");
  await page
    .getByRole("dialog", { name: "Defenses" })
    .getByRole("button", { name: "With assignments" })
    .click();
  await page.keyboard.press("Escape");

  await pick("4-3 Cover 3");
  await expect(page.locator("[data-scene-path]")).toHaveCount(routes + 7);

  await pick("Fire Zone Blitz");
  // Ten men and six lines, and not one of the eleven or seven before them.
  await expect(page.locator("[data-scene-player]")).toHaveCount(21);
  await expect(page.locator("[data-scene-path]")).toHaveCount(routes + 6);
  await expect(page.getByTitle("Browse defenses — ⇧⌘D")).toContainText(
    "Fire Zone Blitz",
  );
});

test("draws a whole concept by position, and takes it off with the same button", async ({
  page,
}) => {
  await openEditor(page);
  const routes = await page.locator("[data-scene-path]").count();

  // A concept is a distribution: the men who play a position in it each get
  // their job, and nobody else is touched.
  await page.getByRole("button", { name: "4 Verts", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("4 Verts");
  await expect(page.getByRole("status")).toContainText("routes drawn");
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);

  const drawn = await page.locator("[data-scene-path]").count();
  expect(drawn).toBeGreaterThan(0);

  // The button says which concept is on, and pressing it again takes it off.
  const verts = page.getByRole("button", { name: "4 Verts", exact: true });
  await expect(verts).toHaveAttribute("aria-pressed", "true");
  await verts.click();
  await expect(page.getByRole("status")).toContainText("cleared");
  await expect(verts).toHaveAttribute("aria-pressed", "false");

  // And the whole thing was one step, both ways.
  await page.keyboard.press("Control+z");
  await expect(page.locator("[data-scene-path]")).toHaveCount(drawn);
  await page.keyboard.press("Control+z");
  await expect(page.locator("[data-scene-path]")).toHaveCount(routes);
});

test("redraws one man's line as a call off the route tree", async ({
  page,
}) => {
  await openEditor(page);
  const z = await playerCenter(page, "z");
  await page.mouse.click(z.x, z.y);
  await expect(
    page.locator(".label-heading").getByText("Player", { exact: true }),
  ).toBeVisible();

  const before = await page.locator('[data-scene-path="rz"]').getAttribute("d");

  // The tree is offered on the line itself, where he is already looking.
  const picker = page.getByLabel(/^Quick call for/).first();
  await expect(picker).toBeVisible();
  await picker.selectOption("corner");

  await expect
    .poll(async () => page.locator('[data-scene-path="rz"]').getAttribute("d"))
    .not.toBe(before);
  // Picking it follows him onto the line.
  await expect(
    page.locator(".label-heading").getByText("Route", { exact: true }),
  ).toBeVisible();

  // And going back to the man, the picker says which call the line now is
  // rather than having forgotten.
  await page.keyboard.press("Escape");
  await page.mouse.click(z.x, z.y);
  await expect(page.getByLabel(/^Quick call for/).first()).toHaveValue(
    "corner",
  );
});

test("puts a call off the tree on the man himself, drawn or redrawn", async ({
  page,
}) => {
  await openEditor(page);
  const routes = await page.locator("[data-scene-path]").count();

  // The quarterback has nothing drawn on him. Picking a man used to leave a
  // Coach with no way to give him a route but to add an alternate first.
  const q = await playerCenter(page, "q");
  await page.mouse.click(q.x, q.y);
  await expect(
    page.locator(".label-heading").getByText("Player", { exact: true }),
  ).toBeVisible();

  const slant = page.getByRole("button", { name: "Slant", exact: true });
  await expect(slant).toBeVisible();
  await slant.click();
  await expect(page.locator("[data-scene-path]")).toHaveCount(routes + 1);
  // The grid stays up, so the next call is one click away rather than a
  // trip back to the man.
  await expect(slant).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator(".label-heading").getByText("Player", { exact: true }),
  ).toBeVisible();

  // Asking for another reshapes the stem he now has rather than piling a
  // second line on top of it.
  await page.getByRole("button", { name: "Corner", exact: true }).click();
  await expect(page.locator("[data-scene-path]")).toHaveCount(routes + 1);
  await expect(slant).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("button", { name: "Corner", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // A block sits alongside his route rather than replacing it, and the same
  // button takes it off again.
  const drive = page.getByRole("button", { name: "Drive", exact: true });
  await drive.click();
  await expect(page.locator("[data-scene-path]")).toHaveCount(routes + 2);
  await expect(drive).toHaveAttribute("aria-pressed", "true");
  await drive.click();
  await expect(page.locator("[data-scene-path]")).toHaveCount(routes + 1);

  // A man who already has a stem is redrawn on it, and the count holds.
  await page.keyboard.press("Escape");
  const z = await playerCenter(page, "z");
  await page.mouse.click(z.x, z.y);
  const before = await page.locator('[data-scene-path="rz"]').getAttribute("d");
  await page.getByRole("button", { name: "Wheel", exact: true }).click();
  await expect
    .poll(async () => page.locator('[data-scene-path="rz"]').getAttribute("d"))
    .not.toBe(before);
  await expect(page.locator("[data-scene-path]")).toHaveCount(routes + 1);
});

test("gives the whole line a call at once, and takes it off again", async ({
  page,
}) => {
  await openEditor(page);
  const routes = await page.locator("[data-scene-path]").count();

  const passSet = page.getByRole("button", { name: "Pass set", exact: true });
  await expect(passSet).toHaveAttribute("aria-pressed", "false");
  await passSet.click();

  // Five linemen, five blocks — each drawn from where he stands, so the call
  // keeps every one of them his own alignment.
  await expect(page.locator("[data-scene-path]")).toHaveCount(routes + 5);
  await expect(passSet).toHaveAttribute("aria-pressed", "true");

  // Another call replaces it rather than piling on top.
  const reach = page.getByRole("button", { name: "Reach", exact: true });
  await reach.click();
  await expect(page.locator("[data-scene-path]")).toHaveCount(routes + 5);
  await expect(passSet).toHaveAttribute("aria-pressed", "false");
  await expect(reach).toHaveAttribute("aria-pressed", "true");

  // And the same button takes it off.
  await reach.click();
  await expect(page.locator("[data-scene-path]")).toHaveCount(routes);
  await expect(reach).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("Control+z");
  await expect(page.locator("[data-scene-path]")).toHaveCount(routes + 5);
});

test("spots the ball on a hash and takes the whole Play with it", async ({
  page,
}) => {
  await openEditor(page);
  const before = await playerAt(page, "z");
  const routes = await page.locator("[data-scene-path]").count();

  const middle = page.getByRole("button", { name: "Middle", exact: true });
  const rightHash = page.getByRole("button", { name: "R hash", exact: true });
  await expect(middle).toHaveAttribute("aria-pressed", "true");
  // The spot it is already on has nothing to do, and grey and inert come from
  // that same answer.
  await expect(middle).toBeDisabled();
  await expect(rightHash).toBeEnabled();

  await rightHash.click();
  await expect(rightHash).toHaveAttribute("aria-pressed", "true");
  await expect(middle).toHaveAttribute("aria-pressed", "false");
  await expect(rightHash).toBeDisabled();
  await expect(middle).toBeEnabled();

  // Nobody was lost and nothing was redrawn — the Play travelled with the ball.
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await expect(page.locator("[data-scene-path]")).toHaveCount(routes);
  const after = await playerAt(page, "z");
  expect(after.x).not.toBeCloseTo(before.x, 1);

  // This set is too wide for the right hash, so it says what it had to do.
  await expect(page.getByRole("status")).toContainText("tightened");

  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await playerAt(page, "z")).x)
    .toBeCloseTo(before.x, 1);
});

const cameraOf = async (page: Page) => {
  const box = await field(page).getAttribute("viewBox");
  const [x, y, width, height] = (box ?? "").split(" ").map(Number);
  return { x: x!, y: y!, width: width!, height: height! };
};

test("pushes the field in and out with the wheel, holding the point under the pointer", async ({
  page,
  browserName,
}) => {
  // A wheel is a mouse gesture; a tablet pinches instead, which its own
  // browser will not synthesise either.
  test.skip(browserName === "webkit", "no wheel on mobile WebKit");
  await openEditor(page);
  const fit = await cameraOf(page);
  expect(fit).toMatchObject({ x: 0, y: 0 });

  const at = await fieldPoint(page, 800, 300);
  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(0, -120);

  await expect
    .poll(async () => (await cameraOf(page)).width)
    .toBeLessThan(fit.width);
  const zoomed = await cameraOf(page);
  // The frame keeps its proportion, so the picture is not stretched.
  expect(zoomed.width / zoomed.height).toBeCloseTo(fit.width / fit.height, 3);
  // And the point under the pointer stayed where it was.
  expect((800 - zoomed.x) / zoomed.width).toBeCloseTo(800 / fit.width, 2);

  // Zooming back out returns to the whole frame and no further.
  for (let step = 0; step < 10; step += 1) await page.mouse.wheel(0, 120);
  await expect
    .poll(async () => (await cameraOf(page)).width)
    .toBeCloseTo(fit.width, 3);
});

test("shows the whole field, or just what the Coach picked, from the keyboard", async ({
  page,
}) => {
  await openEditor(page);
  const fit = await cameraOf(page);

  // Nothing picked, so this shows the whole field rather than nothing at all.
  await page.keyboard.press("Control+2");
  await expect
    .poll(async () => (await cameraOf(page)).width)
    .toBeCloseTo(fit.width, 3);

  const z = await playerCenter(page, "z");
  await page.mouse.click(z.x, z.y);
  await page.keyboard.press("Control+2");
  await expect
    .poll(async () => (await cameraOf(page)).width)
    .toBeLessThan(fit.width);

  await page.keyboard.press("Control+0");
  await expect
    .poll(async () => (await cameraOf(page)).width)
    .toBeCloseTo(fit.width, 3);
});

test("keeps a grab target the size his finger is, however far in he has zoomed", async ({
  page,
}) => {
  await openEditor(page);
  const z = await playerCenter(page, "z");
  await page.mouse.click(z.x, z.y);
  await page.locator('[data-scene-path="rz"]').click({ force: true });
  // The break handles are round; the zone corner is not, so read the radii
  // that exist rather than whichever element happens to come first.
  const radii = () =>
    page
      .locator(".handle-target")
      .evaluateAll((elements) =>
        elements
          .map((element) => Number(element.getAttribute("r")))
          .filter((value) => value > 0),
      );
  await expect.poll(async () => (await radii()).length).toBeGreaterThan(0);
  const atFit = Math.max(...(await radii()));

  // Handles are drawn in frame units, and a frame unit is bigger on screen
  // the further in he is — so they shrink to stay one size under his finger.
  await page.keyboard.press("Control+Equal");
  await expect
    .poll(async () => Math.max(...(await radii())))
    .toBeLessThan(atFit);

  await page.keyboard.press("Control+0");
  await expect
    .poll(async () => Math.max(...(await radii())))
    .toBeCloseTo(atFit, 3);
});

test("keeps the field under the pointer once the Coach has zoomed in", async ({
  page,
}) => {
  await openEditor(page);
  const q = await playerCenter(page, "q");
  await page.mouse.click(q.x, q.y);
  await expect(
    page.locator(".label-heading").getByText("Player", { exact: true }),
  ).toBeVisible();

  // Shown on his own, he is now drawn somewhere else on screen entirely.
  await page.keyboard.press("Control+2");
  await expect
    .poll(async () => (await cameraOf(page)).width)
    .toBeLessThan(VIEWBOX_WIDTH);
  await page.keyboard.press("Escape");
  await expect(
    page.locator(".label-heading").getByText("Player", { exact: true }),
  ).toBeHidden();

  // Pressing where he is drawn must still be pressing him, which it only is
  // if a client pixel is read through the camera rather than the whole frame.
  const zoomedQ = await playerCenter(page, "q");
  await page.mouse.click(zoomedQ.x, zoomedQ.y);
  await expect(
    page.locator(".label-heading").getByText("Player", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Letter" })).toHaveValue("Q");

  // And how near his own drawn edge a press has to be does not grow with the
  // picture. Ten frame units off his middle is well outside the seventeen
  // screen pixels a mouse is allowed at this zoom, and well inside what those
  // seventeen pixels would be worth if the camera were left out of the sum.
  const at = await playerAt(page, "q");
  const beside = await fieldPoint(page, at.x + 10, at.y);
  await page.mouse.click(beside.x, beside.y);
  await expect(
    page.locator(".label-heading").getByText("Player", { exact: true }),
  ).toBeHidden();
});

test("flips the strength, so the picture and the words agree", async ({
  page,
}) => {
  await openEditor(page);
  const before = await playerAt(page, "z");

  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Type a command/).fill("Flip strength");
  await page.keyboard.press("Enter");

  await expect
    .poll(async () => (await playerAt(page, "z")).x)
    .not.toBeCloseTo(before.x, 1);
  // The Z is drawn where the X was, because a letter says which side a man
  // plays, and the tag under him was flipped with him.
  await expect(page.locator('[data-scene-player="z"]')).toBeVisible();
});

test("ties things together so they are picked as one, and unties them again", async ({
  page,
}) => {
  await openEditor(page);
  const z = await playerCenter(page, "z");
  const y = await playerCenter(page, "y");

  await page.mouse.click(z.x, z.y);
  await page.keyboard.down("Shift");
  await page.mouse.click(y.x, y.y);
  await page.keyboard.up("Shift");
  await page.keyboard.press("Control+g");

  // Picking either of them now picks both, which is all a group does.
  await page.keyboard.press("Escape");
  await page.mouse.click(z.x, z.y);
  await expect
    .poll(async () => page.locator("circle.selection-halo").count())
    .toBeGreaterThan(1);

  // And they move as one, which is the other half of what a group is for —
  // from nothing picked, so the same press that takes hold of him is the one
  // that has to take hold of the rest of his group.
  await page.keyboard.press("Escape");
  const yBefore = await playerAt(page, "y");
  const zNow = await playerCenter(page, "z");
  await drag(page, zNow, { x: zNow.x, y: zNow.y - 60 });
  await expect
    .poll(async () => (await playerAt(page, "y")).y)
    .toBeLessThan(yBefore.y - 1);

  await page.keyboard.press("Shift+Control+g");
  await page.keyboard.press("Escape");
  const zAfter = await playerCenter(page, "z");
  await page.mouse.click(zAfter.x, zAfter.y);
  await expect
    .poll(async () => page.locator("circle.selection-halo").count())
    .toBe(1);
});

test("gives a finger the forty-four pixels it is owed, on the screen it is really on", async ({
  page,
  browserName,
}) => {
  // ADR 0016 asks for a 44 CSS pixel touch target. The field is drawn in
  // frame units, and how many pixels one of those is worth depends on how big
  // the screen is — so this is measured on the glass rather than in the frame.
  test.skip(browserName !== "webkit", "the coarse-pointer device");
  await openEditor(page);
  // Picked with the finger it is owed to. The tablet would call itself coarse
  // whatever reached it, which is exactly the answer that cannot be trusted.
  await contact(page, "touch", 41).tap(await routeMidpoint(page, "rz"));

  // Half a pixel of slack, because the browser rounds the box it reports and
  // the arithmetic lands this on the minimum exactly rather than above it.
  expect(await smallestHandle(page)).toBeGreaterThanOrEqual(43.5);
});

test("gives the field to a keyboard, and says what it has picked", async ({
  page,
}) => {
  await openEditor(page);

  // The picture is still a picture; the same field is also an ordinary list,
  // so the tab order a screen reader already gives him is the order he reads
  // the Play in.
  const outline = page.getByRole("list", { name: "Everything on the field" });
  await expect(outline).toBeAttached();
  const items = outline.getByRole("button");
  await expect(items).toHaveCount(28);

  // Named the way a Coach would say it aloud, men first and then their lines.
  await expect(items.first()).toHaveText(/offense player/);
  await expect(outline.getByRole("button", { name: "X route" })).toBeAttached();

  // And every one of them picks what it names, reached the way it is meant
  // to be reached: with the keyboard rather than with a pointer.
  await outline.getByRole("button", { name: "X route" }).press("Enter");
  await expect(
    outline.getByRole("button", { name: "X route" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator(".label-heading").getByText("Route", { exact: true }),
  ).toBeVisible();

  // What is picked is said out loud, for anybody who cannot see the halo.
  await expect(page.locator('[aria-live="polite"]')).toHaveText(/X route/);
});

test("lets a control the Coach tabbed to have its own Enter and Space", async ({
  page,
}) => {
  await openEditor(page);
  // The field wants both keys — Enter finishes a route, Space pans it — and
  // swallowing them left every button in the app dead to anyone working
  // without a pointer.
  const shortcuts = page.getByRole("button", {
    name: "Shortcuts ?",
    exact: true,
  });
  await shortcuts.press("Enter");
  await expect(
    page.getByText("Keyboard shortcuts", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await shortcuts.press(" ");
  await expect(
    page.getByText("Keyboard shortcuts", { exact: true }),
  ).toBeVisible();
});

/**
 * One pointer of one kind on the glass. The browsers under test will not
 * synthesise a Pencil or a second finger, so the events are made here — the
 * field does its own hit testing from the coordinates, so where they are
 * dispatched does not matter, only where they say they are.
 */
function contact(page: Page, pointerType: string, pointerId: number) {
  const send = (type: string, at: { x: number; y: number }) =>
    field(page).dispatchEvent(type, {
      pointerId,
      pointerType,
      button: 0,
      buttons: type === "pointerdown" || type === "pointermove" ? 1 : 0,
      isPrimary: true,
      clientX: at.x,
      clientY: at.y,
    });
  return {
    down: (at: { x: number; y: number }) => send("pointerdown", at),
    move: (at: { x: number; y: number }) => send("pointermove", at),
    up: (at: { x: number; y: number }) => send("pointerup", at),
    tap: async (at: { x: number; y: number }) => {
      await send("pointerdown", at);
      await send("pointerup", at);
    },
  };
}

/** A point half way along a route, in client pixels. */
async function routeMidpoint(
  page: Page,
  id: string,
): Promise<{ x: number; y: number }> {
  const at = await page
    .locator(`[data-scene-path="${id}"]`)
    .evaluate((element) => {
      const path = element as unknown as SVGPathElement;
      const point = path.getPointAtLength(path.getTotalLength() / 2);
      return { x: point.x, y: point.y };
    });
  return fieldPoint(page, at.x, at.y);
}

/** The smallest grab target on screen, in CSS pixels. */
async function smallestHandle(page: Page): Promise<number> {
  const handles = page.locator("circle.handle-target");
  await expect.poll(async () => handles.count()).toBeGreaterThan(0);
  return Math.min(
    ...(await handles.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().width),
    )),
  );
}

test("gives a Pencil the precision it was reached for, and a finger the room it needs", async ({
  page,
}) => {
  await openEditor(page);
  // A tablet answers `(pointer: coarse)` whichever the Coach picked up, so
  // the field goes by what actually touched it (ADR 0016).
  await contact(page, "touch", 11).tap(await routeMidpoint(page, "rz"));
  await expect(
    page.locator(".label-heading").getByText("Route", { exact: true }),
  ).toBeVisible();
  // Half a pixel of slack, because the browser rounds the box it reports.
  expect(await smallestHandle(page)).toBeGreaterThanOrEqual(43.5);

  // The same route, now under a Pencil: the tip means what it points at, and
  // a target sized for a fingertip is precision thrown away.
  await contact(page, "pen", 12).tap(await routeMidpoint(page, "rz"));
  await expect.poll(async () => smallestHandle(page)).toBeLessThan(43.5);

  // A handle takes its own press, so the field never sees it. It is still the
  // Pencil, and a Coach who only ever reaches for handles with it must not be
  // handed a fingertip's targets for the rest of the session.
  await contact(page, "touch", 13).tap(await routeMidpoint(page, "rz"));
  await expect.poll(async () => smallestHandle(page)).toBeGreaterThan(43.5);
  await page
    .locator("circle.handle-target")
    .first()
    .dispatchEvent("pointerdown", {
      pointerId: 14,
      pointerType: "pen",
      button: 0,
      buttons: 1,
      isPrimary: true,
    });
  await expect.poll(async () => smallestHandle(page)).toBeLessThan(43.5);
});

test("does not draw with the hand holding the Pencil", async ({ page }) => {
  await openEditor(page);
  const xBefore = await playerAt(page, "x");
  const zBefore = await playerAt(page, "z");

  const pen = contact(page, "pen", 21);
  const palm = contact(page, "touch", 22);

  // The heel of his hand lands before the tip does — on another man, and
  // moving, because a hand settling on glass slides.
  const resting = await playerCenter(page, "z");
  await palm.down(resting);
  await palm.move({ x: resting.x - 40, y: resting.y + 20 });

  // The Pencil arrives, and everything the hand had started stops being a
  // gesture: what it had picked up is put back down where it was.
  const from = await playerCenter(page, "x");
  const looking = await cameraOf(page);
  await pen.down(from);
  await pen.move({ x: from.x + 20, y: from.y + 10 });

  // The hand goes on sliding under the stroke — back the way it came, which
  // is the direction that would show if the field were still following it —
  // and none of it counts.
  await palm.move({ x: resting.x + 90, y: resting.y - 60 });
  await palm.up({ x: resting.x + 90, y: resting.y - 60 });

  // It settles again mid-stroke, on another man, and drags him nowhere: a
  // contact that arrives while the tip is on the glass is the hand, whatever
  // it lands on.
  const heel = contact(page, "touch", 23);
  await heel.down(resting);
  await heel.move({ x: resting.x + 60, y: resting.y - 50 });
  await heel.up({ x: resting.x + 60, y: resting.y - 50 });

  await pen.move({ x: from.x + 40, y: from.y + 20 });
  await pen.up({ x: from.x + 40, y: from.y + 20 });

  await expect
    .poll(async () => (await playerAt(page, "x")).x)
    .toBeGreaterThan(xBefore.x);
  expect(await playerAt(page, "z")).toEqual(zBefore);
  // Nor did the hand move the field out from under the line he was drawing.
  expect(await cameraOf(page)).toEqual(looking);
  // One stroke, one entry: the palm did not leave one of its own.
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toHaveAttribute("title", "Undo Move Player");
  await undo.click();
  await expect.poll(async () => playerAt(page, "x")).toEqual(xBefore);
  await expect(undo).toBeDisabled();

  // And the hand the Pencil interrupted is off the books. The next finger
  // down is one finger moving the field, not the second half of a pinch with
  // a palm that is no longer there.
  const next = contact(page, "touch", 24);
  const grass = await fieldPoint(page, 900, 120);
  await next.down(grass);
  await next.move({ x: grass.x - 60, y: grass.y });
  await next.up({ x: grass.x - 60, y: grass.y });
  const moved = await cameraOf(page);
  expect(moved.width).toBeCloseTo(VIEWBOX_WIDTH, 3);
  expect(moved.x).toBeGreaterThan(0);
});

test("does not let the resting hand carry a part-drawn route", async ({
  page,
}) => {
  await openEditor(page);
  const pen = contact(page, "pen", 51);
  const palm = contact(page, "touch", 52);

  // A route begun with the Pencil off a man's stance, and left part-drawn:
  // the next press puts the next break down, so the line follows the tip
  // between them.
  await page.keyboard.press("r");
  const start = await playerCenter(page, "q");
  await pen.down(start);
  const preview = page.locator("[data-drawing-preview]");
  await expect(preview).toHaveAttribute("d", /^M /);

  // The hand is on the glass while the tip is, so its press is refused
  // outright. It is still there when the tip comes up, and it slides.
  await palm.down({ x: start.x + 30, y: start.y + 30 });
  await pen.up(start);
  const drawn = await preview.getAttribute("d");
  await palm.move({ x: start.x + 160, y: start.y + 120 });

  // The line still reaches for the tip, not for the hand.
  await expect(preview).toHaveAttribute("d", drawn!);

  // The Coach puts the next break down and holds the tip there, which is how
  // a segment is bent. His hand comes off the glass part way through — and a
  // press the field refused must not be able to end one it accepted.
  await pen.down({ x: start.x - 100, y: start.y });
  await palm.up({ x: start.x + 160, y: start.y + 120 });
  await pen.move({ x: start.x - 100, y: start.y - 60 });
  await expect(preview).toHaveAttribute("d", /Q /);

  await page.keyboard.press("Escape");
});

test("keeps the field moving under the finger a pinch leaves behind", async ({
  page,
}) => {
  await openEditor(page);
  const qBefore = await playerAt(page, "q");
  const first = contact(page, "touch", 61);
  const second = contact(page, "touch", 62);

  // Two fingers on a man: a pinch, not a drag, so he is not going anywhere.
  const at = await playerCenter(page, "q");
  const apart = { x: at.x + 120, y: at.y };
  await first.down(at);
  await second.down(apart);
  // And the rest of the hand landing joins the pinch rather than starting
  // anything of its own: two fingers are what a pinch is measured between,
  // so a third on another man does not reach for him.
  const third = contact(page, "touch", 63);
  const other = await playerCenter(page, "z");
  await third.down(other);
  await second.move({ x: apart.x + 90, y: apart.y });
  await expect
    .poll(async () => (await cameraOf(page)).width)
    .toBeLessThan(VIEWBOX_WIDTH);
  await expect(page.locator('[data-scene-player="z"].selected')).toHaveCount(0);
  await third.up(other);

  // One finger comes off, which is how a pinch usually ends. The other is
  // still down and still moving, and the field goes with it rather than
  // waiting to be lifted.
  const zoomed = await cameraOf(page);
  await second.up({ x: apart.x + 90, y: apart.y });
  await first.move({ x: at.x - 80, y: at.y });
  await expect
    .poll(async () => (await cameraOf(page)).x)
    .toBeGreaterThan(zoomed.x);
  await first.up({ x: at.x - 80, y: at.y });

  // And through all of it, the man underneath was never picked up.
  expect(await playerAt(page, "q")).toEqual(qBefore);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("hands the field to the finger once the Pencil is out", async ({
  page,
}) => {
  await openEditor(page);
  // Until then a finger is the only pointer he has, so it still picks men up.
  const finger = contact(page, "touch", 31);
  const q = await playerCenter(page, "q");
  const qBefore = await playerAt(page, "q");
  await finger.down(q);
  await finger.move({ x: q.x + 60, y: q.y });
  await finger.up({ x: q.x + 60, y: q.y });
  await expect
    .poll(async () => (await playerAt(page, "q")).x)
    .toBeGreaterThan(qBefore.x);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => playerAt(page, "q")).toEqual(qBefore);

  // A Pencil touches the field, and the hands change jobs: the tip draws,
  // and the finger moves the field under it.
  await contact(page, "pen", 32).tap(await playerCenter(page, "q"));
  await page.keyboard.press("Control+Equal");
  await expect
    .poll(async () => (await cameraOf(page)).width)
    .toBeLessThan(VIEWBOX_WIDTH);
  const looking = await cameraOf(page);

  const across = contact(page, "touch", 33);
  const grass = await playerCenter(page, "q");
  await across.down(grass);
  await across.move({ x: grass.x - 90, y: grass.y - 30 });
  await across.up({ x: grass.x - 90, y: grass.y - 30 });

  await expect
    .poll(async () => (await cameraOf(page)).x)
    .toBeGreaterThan(looking.x);
  // And the man he dragged across stayed exactly where he was.
  expect(await playerAt(page, "q")).toEqual(qBefore);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

/**
 * A phone shows the Play and nothing that changes it (Phase 4.5). These run
 * at a phone's own size on whichever browser the project names, because what
 * makes a screen a phone here is how big it is, not what it is.
 */
test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows the Play to be read, and will not let it be changed", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("img", { name: "Stick — Thunder football play" }),
    ).toBeVisible();
    await expect(page.locator("[data-scene-player]")).toHaveCount(11);
    await expect(page.getByText("Read only", { exact: true })).toBeVisible();
    // None of the editing chrome is here to be reached at all.
    await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
    await expect(page.getByLabel("Drawing tools")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Inspector" })).toHaveCount(
      0,
    );

    // A thumb dragged across a man moves the field, not the man.
    const qBefore = await playerAt(page, "q");
    const finger = contact(page, "touch", 71);
    const q = await playerCenter(page, "q");
    await finger.down(q);
    await finger.move({ x: q.x - 70, y: q.y - 40 });
    await finger.up({ x: q.x - 70, y: q.y - 40 });
    expect(await playerAt(page, "q")).toEqual(qBefore);
    expect((await cameraOf(page)).x).toBeGreaterThan(0);

    // Nor does a keyboard reach the field — one arrives paired, and what it
    // would reach is a Play the Coach cannot see he has changed. The camera
    // keys are the visible proof that the shortcuts are off; the ones beside
    // them delete men and undo the last thing he did on this device.
    // Backspace is left out of this on purpose: with the field's shortcuts
    // off, nothing swallows it, and WebKit still reads it as the back button.
    const looking = await cameraOf(page);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("v");
    await page.keyboard.press("Control+0");
    await page.keyboard.press("Control+2");
    await expect(page.locator("[data-scene-player]")).toHaveCount(11);
    expect(await playerAt(page, "q")).toEqual(qBefore);
    expect(await cameraOf(page)).toEqual(looking);

    // And the Play is still readable without sight: every man, line and note
    // is named, in the order a Coach would read them out.
    await expect(
      page.getByRole("list", { name: "Everything on the field" }),
    ).toHaveCount(1);
    // Stick — Thunder is eleven men, five lines and twelve notes.
    await expect(
      page
        .getByRole("list", { name: "Everything on the field" })
        .getByRole("listitem"),
    ).toHaveCount(11 + 5 + 12);
    await expect(
      page
        .getByRole("list", { name: "Everything on the field" })
        .getByRole("listitem")
        .filter({ hasText: "X offense player" }),
    ).toHaveCount(1);
  });

  test("gives the editor back when the screen is big enough again", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText("Read only", { exact: true })).toBeVisible();

    // A phone turned on its side is still a phone: wide enough now, and
    // nowhere near deep enough.
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByText("Read only", { exact: true })).toBeVisible();

    // A tablet is not, and the editor comes back without a reload.
    await page.setViewportSize({ width: 834, height: 1194 });
    await expect(page.getByLabel("Drawing tools")).toBeVisible();
    await expect(page.getByText("Read only", { exact: true })).toHaveCount(0);

    // Gone in for a close look at one man, and then the window is a phone
    // again: what he can only read, he reads whole.
    await page.keyboard.press("Control+Equal");
    await expect
      .poll(async () => (await cameraOf(page)).width)
      .toBeLessThan(VIEWBOX_WIDTH);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("Read only", { exact: true })).toBeVisible();
    await expect
      .poll(async () => (await cameraOf(page)).width)
      .toBeCloseTo(VIEWBOX_WIDTH, 3);

    // A close look taken on the phone is his, and picking the tablet back up
    // does not throw it away.
    const first = contact(page, "touch", 73);
    const second = contact(page, "touch", 74);
    const at = await fieldPoint(page, 500, 260);
    await first.down({ x: at.x - 40, y: at.y });
    await second.down({ x: at.x + 40, y: at.y });
    await second.move({ x: at.x + 130, y: at.y });
    await expect
      .poll(async () => (await cameraOf(page)).width)
      .toBeLessThan(VIEWBOX_WIDTH);
    const close = await cameraOf(page);
    await first.up({ x: at.x - 40, y: at.y });
    await second.up({ x: at.x + 130, y: at.y });

    await page.setViewportSize({ width: 834, height: 1194 });
    await expect(page.getByLabel("Drawing tools")).toBeVisible();
    expect((await cameraOf(page)).width).toBeCloseTo(close.width, 3);

    const qBefore = await playerAt(page, "q");
    const finger = contact(page, "touch", 72);
    const q = await playerCenter(page, "q");
    await finger.down(q);
    await finger.move({ x: q.x + 60, y: q.y });
    await finger.up({ x: q.x + 60, y: q.y });
    await expect
      .poll(async () => (await playerAt(page, "q")).x)
      .toBeGreaterThan(qBefore.x);
  });
});
