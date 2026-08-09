import { expect, test, type Page } from "@playwright/test";

/**
 * Drives real pointer gestures through the production field: the unified
 * input machine behind them must select like the original, commit exactly one
 * undoable transaction per completed gesture, and abandon a cancelled one.
 */

const VIEWBOX_WIDTH = 1068;
const VIEWBOX_HEIGHT = 525;

const field = (page: Page) => page.locator("svg.field-diagram").first();

/** Converts editor viewBox coordinates to client coordinates. */
async function fieldPoint(
  page: Page,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  const box = await field(page).boundingBox();
  if (!box) throw new Error("The field is not on screen.");
  return {
    x: box.x + (x / VIEWBOX_WIDTH) * box.width,
    y: box.y + (y / VIEWBOX_HEIGHT) * box.height,
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

  // A rectangle of empty grass around the five offensive linemen.
  await drag(
    page,
    await fieldPoint(page, 440, 400),
    await fieldPoint(page, 630, 432),
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
  await expect(preview).toHaveAttribute("d", "M 534 446 L 534 446");

  await page.mouse.move(start.x, start.y - 60);
  // Snap constrains the break to a 45 degree family member — here straight
  // downfield, so the preview keeps the Quarterback's lateral position.
  await expect(preview).toHaveAttribute("d", /^M 534 446 L 534 3\d\d/);
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

  // Z's stem runs straight downfield at x 946.9, from y 417.8 up to 248.8.
  const zStem = await fieldPoint(page, 947, 330);
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

  const zStem = await fieldPoint(page, 947, 330);
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
  const onSegment = await fieldPoint(page, 280, 367);
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
  const onStem = await fieldPoint(page, 947, 330);
  await page.mouse.click(onStem.x, onStem.y);
  await expect(page.locator("[data-branch-marker]")).toHaveCount(1);

  // Clicking the branch line itself selects that line, handles and all.
  const onBranch = await fieldPoint(page, 966, 110);
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
  const onSegment = await fieldPoint(page, 280, 367);
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
  const onSegmentAgain = await fieldPoint(page, 280, 367);
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

  const onSegment = await fieldPoint(page, 280, 367);
  await page.mouse.click(onSegment.x, onSegment.y);
  await expect(
    page.locator(".label-heading").getByText("Route", { exact: true }),
  ).toBeVisible();

  // The read number and the Assignment print on the field.
  await page.getByRole("textbox", { name: "Assignment" }).fill("Stick");
  await page.getByRole("textbox", { name: "Conversion" }).fill("vs man: fade");
  await page.locator(".read-field input").fill("2");
  await page.getByRole("textbox", { name: "Coaching note" }).blur();

  await expect(page.locator('[data-scene-read="rx-read"]')).toHaveCount(1);
  await expect(
    page.locator('[data-scene-coaching="rx-assignment"]'),
  ).toHaveText("STICK");
  await expect(
    page.locator('[data-scene-coaching="rx-conversion"]'),
  ).toHaveText("vs man: fade");

  // The words survive being read back, which is the whole promise: they ride
  // along with the route rather than living in the panel.
  await page.reload();
  await expect(
    page.locator('[data-scene-coaching="rx-assignment"]'),
  ).toHaveText("STICK");
  await expect(page.locator('[data-scene-read="rx-read"]')).toHaveCount(1);

  // Measured again: the panel closed on reload, and the wider field it left
  // behind puts the segment somewhere else.
  const onSegmentAgain = await fieldPoint(page, 280, 367);
  await page.mouse.click(onSegmentAgain.x, onSegmentAgain.y);
  await expect(page.getByRole("textbox", { name: "Assignment" })).toHaveValue(
    "Stick",
  );
  await expect(page.locator(".read-field input")).toHaveValue("2");
});

test("takes the wording off a route when the Coach empties it", async ({
  page,
}) => {
  await openEditor(page);
  const onSegment = await fieldPoint(page, 280, 367);
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

  const onSegment = await fieldPoint(page, 280, 367);
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

  const onSegment = await fieldPoint(page, 280, 367);
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

  const onX = await fieldPoint(page, 280, 367);
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
  await browser.getByRole("textbox").fill("trips");
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
