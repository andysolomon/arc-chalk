import { type Page, test as blankTest } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * The editor on a phone (issues #98 and #99): the status bar's controls stay
 * on the glass, and "Fit the field" fits the field to the stage it is in —
 * in both directions, because a phone held sideways is wide and shallow.
 */
const VIEWPORTS = [
  { name: "360×800", width: 360, height: 800 },
  { name: "375×667", width: 375, height: 667 },
  { name: "390×844", width: 390, height: 844 },
  { name: "430×932", width: 430, height: 932 },
  { name: "844×390", width: 844, height: 390 },
  { name: "926×428", width: 926, height: 428 },
];

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Where the drawing actually is on the glass, not where its element box is. */
const renderedFieldRect = (page: Page) =>
  page.evaluate((): Rect => {
    const svg = document.querySelector("svg.field-diagram");
    if (!svg) throw new Error("No field on screen.");
    let union: Rect | undefined;
    for (const node of svg.querySelectorAll("*")) {
      if (node.closest("defs")) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      union = union
        ? {
            left: Math.min(union.left, rect.left),
            top: Math.min(union.top, rect.top),
            right: Math.max(union.right, rect.right),
            bottom: Math.max(union.bottom, rect.bottom),
          }
        : {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          };
    }
    if (!union) throw new Error("The field drew nothing.");
    return union;
  });

const stageRect = (page: Page) =>
  page.evaluate((): Rect => {
    const stage = document.querySelector(".field-wrap");
    if (!stage) throw new Error("No stage on screen.");
    const rect = stage.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    };
  });

/**
 * On a phone the status bar's row is the zoom and the timeline (issue #98);
 * the save state is out of it while there is nothing to report, so a good
 * write is read from the button itself. A failed one shows.
 */
const expectSavedOnThisDevice = (page: Page) =>
  expect(page.locator("button.save-state")).toHaveAttribute(
    "aria-label",
    "Saved on this device",
  );

/**
 * Every viewport here is below the editor's floor, so the phone workspace is
 * what opens. The layout is a media-query effect that runs after mount and
 * the desktop editor renders for a frame before it, so wait for the phone
 * shell itself rather than racing that frame.
 */
const waitForPhoneWorkspace = async (page: Page) => {
  await expect(page.locator(".chalk-shell.phone-workspace")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("navigation", { name: "Drawing tools" }),
  ).toBeVisible();
};

const enterEditor = async (page: Page) => {
  await page.goto("/");
  await waitForPhoneWorkspace(page);
};

/**
 * One finger pressed, dragged and lifted. The press goes to whatever is under
 * it — a handle's target included — and the rest to the field, which holds
 * the gesture once it starts.
 */
const fingerDrag = async (
  page: Page,
  pointerId: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
) => {
  const send = (type: string, at: { x: number; y: number }, under: boolean) =>
    page.evaluate(
      ({ type, at, under, pointerId }) => {
        const target = under
          ? document.elementFromPoint(at.x, at.y)
          : document.querySelector("svg.field-diagram");
        if (!target) throw new Error("Nothing under the finger.");
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId,
            pointerType: "touch",
            isPrimary: true,
            button: type === "pointermove" ? -1 : 0,
            buttons: type === "pointerup" ? 0 : 1,
            clientX: at.x,
            clientY: at.y,
          }),
        );
      },
      { type, at, under, pointerId },
    );
  await send("pointerdown", from, true);
  for (let step = 1; step <= 6; step += 1) {
    await send(
      "pointermove",
      {
        x: from.x + ((to.x - from.x) * step) / 6,
        y: from.y + ((to.y - from.y) * step) / 6,
      },
      false,
    );
  }
  await send("pointerup", to, false);
};

for (const viewport of VIEWPORTS) {
  test.describe(`phone editor at ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });

    test("keeps every status control on the glass and zoom under a finger", async ({
      page,
    }) => {
      await enterEditor(page);
      const controls = page.locator(".status-controls > *:visible");
      const count = await controls.count();
      expect(count).toBeGreaterThan(0);
      for (let index = 0; index < count; index += 1) {
        const control = controls.nth(index);
        const box = await control.boundingBox();
        expect(
          box,
          await control.evaluate((node) => node.outerHTML),
        ).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      }

      // The save state is out of the row while it has nothing to report;
      // the one report of a failed write would stand here at every width.
      await expectSavedOnThisDevice(page);

      await page.getByRole("button", { name: "Zoom in" }).tap();
      await expect(
        page.getByRole("button", { name: "Fit the field — 125% zoom" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Fit the field — 125% zoom" })
        .tap();
      await expect(
        page.getByRole("button", { name: "Fit the field — 100% zoom" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Zoom out" }).tap();
      await expect(
        page.getByRole("button", { name: "Fit the field — 80% zoom" }),
      ).toBeVisible();
    });

    test("keeps the play's timeline in the status row beside the zoom", async ({
      page,
    }) => {
      await enterEditor(page);
      const statusbar = page.locator(".statusbar");
      const bar = statusbar.getByLabel("Playback controls");
      await expect(bar).toBeVisible();
      await expect(page.getByLabel("Playback controls")).toHaveCount(1);

      // The scrubber shares the row with the zoom and keeps room to drag.
      const scrubber = await insideViewport(
        page,
        page.getByRole("slider", { name: "Scrub the play" }),
        viewport,
      );
      const zoomIn = await insideViewport(
        page,
        page.getByRole("button", { name: "Zoom in" }),
        viewport,
      );
      expect(
        Math.abs(
          scrubber.y + scrubber.height / 2 - (zoomIn.y + zoomIn.height / 2),
        ),
      ).toBeLessThan(8);
      expect(scrubber.width).toBeGreaterThanOrEqual(72);
      for (const name of ["Play", "Reset positions"]) {
        await insideViewport(page, bar.getByRole("button", { name }), viewport);
      }

      // The readouts a wider bar carries are gone from the row.
      await expect(statusbar.getByText("saved", { exact: true })).toBeHidden();
      await expect(
        page.getByRole("button", { name: "Center on the ball" }),
      ).toBeHidden();
      await expect(
        page.getByRole("button", { name: "Fit to selection" }),
      ).toBeHidden();

      // The speed is one button that steps through the rates.
      await bar.getByRole("button", { name: "Speed 1× — next 2×" }).tap();
      await expect(
        bar.getByRole("button", { name: "Speed 2× — next 0.5×" }),
      ).toBeVisible();
      await expect(bar).toHaveAttribute("data-playback-rate", "2");
    });

    test("fits the whole field inside the stage", async ({ page }) => {
      await enterEditor(page);
      await page.getByRole("button", { name: "Inspector" }).click();
      await expect(
        page.getByRole("complementary", { name: "Play inspector" }),
      ).toBeVisible();
      await page.getByTitle("Browse formations — ⇧⌘F").click();
      await page
        .getByRole("dialog", { name: "Formations" })
        .getByText("Gun Doubles Right", { exact: true })
        .click();
      await expect(page.locator("[data-scene-player]")).toHaveCount(11);
      // The pick was the errand: the sheet puts itself away.
      await expect(
        page.getByRole("complementary", { name: "Play inspector" }),
      ).toHaveCount(0);

      await page.getByRole("button", { name: "Zoom in" }).tap();
      await page
        .getByRole("button", { name: "Fit the field — 125% zoom" })
        .tap();
      await expect(
        page.getByRole("button", { name: "Fit the field — 100% zoom" }),
      ).toBeVisible();

      const stage = await stageRect(page);
      const field = await renderedFieldRect(page);
      const slack = 1;
      expect(field.left).toBeGreaterThanOrEqual(stage.left - slack);
      expect(field.top).toBeGreaterThanOrEqual(stage.top - slack);
      expect(field.right).toBeLessThanOrEqual(stage.right + slack);
      expect(field.bottom).toBeLessThanOrEqual(stage.bottom + slack);

      // Fit is a fit, not a sliver: the drawing fills one axis of the stage.
      const stageWidth = stage.right - stage.left;
      const stageHeight = stage.bottom - stage.top;
      const fieldWidth = field.right - field.left;
      const fieldHeight = field.bottom - field.top;
      expect(
        Math.max(fieldWidth / stageWidth, fieldHeight / stageHeight),
      ).toBeGreaterThan(0.85);

      // Both halves of the field are on the glass: a man above the line of
      // scrimmage and a man below it.
      const players = page.locator("[data-scene-player]");
      const boxes = await players.evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().top),
      );
      expect(Math.min(...boxes)).toBeGreaterThanOrEqual(stage.top - slack);
      expect(Math.max(...boxes)).toBeLessThanOrEqual(stage.bottom + slack);
    });
  });
}

/**
 * The phone workspace (issue #92): a Coach on a phone gets the editor laid
 * out for the phone — every action reachable by touch,
 * the field with most of the glass, the draft kept through the inspector's
 * sheet and a turn of the phone.
 */
const WORKSPACES = [
  { name: "360×800", width: 360, height: 800 },
  { name: "390×844", width: 390, height: 844 },
  { name: "430×932", width: 430, height: 932 },
  { name: "844×390", width: 844, height: 390 },
];

const insideViewport = async (
  page: Page,
  locator: import("@playwright/test").Locator,
  viewport: { width: number; height: number },
) => {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box, await locator.evaluate((node) => node.outerHTML)).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 0.5);
  return box!;
};

for (const viewport of WORKSPACES) {
  test.describe(`phone workspace at ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });

    test("puts every action within reach and gives the field the glass", async ({
      page,
    }) => {
      await enterEditor(page);

      // A compact header: two rows in portrait, one held sideways — not four.
      const portrait = viewport.height > viewport.width;
      const header = page.locator("header.topbar");
      expect(
        (await insideViewport(page, header, viewport)).height,
      ).toBeLessThanOrEqual(portrait ? 104 : 60);

      const tools = page.locator('nav[aria-label="Drawing tools"] > button');
      const toolCount = await tools.count();
      // Text, Trash and the (hidden) collapse control (ADR 0052).
      expect(toolCount).toBeGreaterThanOrEqual(3);
      for (let index = 0; index < toolCount; index += 1) {
        const tool = tools.nth(index);
        if (!(await tool.isVisible())) continue;
        const box = await insideViewport(page, tool, viewport);
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      for (const name of ["Undo", "Redo", "Save", "More actions"]) {
        await insideViewport(
          page,
          page
            .locator("header.topbar")
            .getByRole("button", { name, exact: true }),
          viewport,
        );
      }
      await insideViewport(
        page,
        page.locator("header.topbar .play-type"),
        viewport,
      );
      await insideViewport(
        page,
        page.getByRole("button", { name: "Inspector", exact: true }),
        viewport,
      );

      // The two new plays and Present ride in the More menu (ADR 0053).
      await page
        .getByRole("button", { name: "More actions", exact: true })
        .tap();
      const more = page.locator(".more-panel");
      await expect(
        more.getByRole("button", { name: /^New offensive play/ }),
      ).toBeVisible();
      await expect(
        more.getByRole("button", { name: /^New defensive play/ }),
      ).toBeVisible();
      await expect(
        more.getByRole("button", { name: /^Present/ }),
      ).toBeVisible();
      await page.keyboard.press("Escape");

      // The field is most of the glass, not a strip between panels.
      const stage = await insideViewport(
        page,
        page.locator(".field-wrap"),
        viewport,
      );
      expect(stage.height / viewport.height).toBeGreaterThan(
        portrait ? 0.5 : 0.45,
      );
      expect(stage.width / viewport.width).toBeGreaterThan(0.95);
    });

    test("edits by touch and keeps the draft through the sheet and a turn", async ({
      page,
    }) => {
      await enterEditor(page);

      // The inspector is a sheet over the field; a formation comes from it.
      await page.getByRole("button", { name: "Inspector", exact: true }).tap();
      const sheet = page.getByRole("complementary", { name: "Play inspector" });
      await expect(sheet).toBeVisible();
      const sheetBox = await insideViewport(page, sheet, viewport);
      expect(sheetBox.width).toBeGreaterThan(viewport.width * 0.9);
      await page.getByTitle("Browse formations — ⇧⌘F").tap();
      await page
        .getByRole("dialog", { name: "Formations" })
        .getByText("Gun Doubles Right", { exact: true })
        .tap();
      await expect(page.locator("[data-scene-player]")).toHaveCount(11);
      // The pick was the errand: the sheet puts itself away.
      await expect(sheet).toHaveCount(0);

      // A draft name survives the sheet coming and going and the phone
      // turning over. Its whole top row is the handle that puts it away.
      const name = page.getByRole("textbox", { name: "Play name" });
      await name.fill("Phone draft");
      await page.getByRole("button", { name: "Inspector", exact: true }).tap();
      await expect(sheet).toBeVisible();
      await page.getByRole("button", { name: "Hide the inspector" }).tap();
      await expect(sheet).toHaveCount(0);
      await expect(name).toHaveValue("Phone draft");
      await expect(page.locator("[data-scene-player]")).toHaveCount(11);
      await page.setViewportSize({
        width: viewport.height,
        height: viewport.width,
      });
      await expect(name).toHaveValue("Phone draft");
      await expect(page.locator("[data-scene-player]")).toHaveCount(11);
      await insideViewport(
        page,
        page
          .locator("header.topbar")
          .getByRole("button", { name: "Save", exact: true }),
        { width: viewport.height, height: viewport.width },
      );
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await name.press("Enter");
      await expectSavedOnThisDevice(page);

      // A line by taps: the man, Draw in his inspector sheet, two breaks,
      // Done (ADR 0052). The seeded Play already carries lines; one more
      // is the measure.
      const routes = await page.locator("[data-scene-path]").count();
      const symbol = page
        .locator("[data-scene-player]")
        .first()
        .locator("circle, rect, path")
        .first();
      const at = await symbol.boundingBox();
      expect(at).not.toBeNull();
      const start = { x: at!.x + at!.width / 2, y: at!.y + at!.height / 2 };
      await page.touchscreen.tap(start.x, start.y);
      await page.getByRole("button", { name: "Inspector", exact: true }).tap();
      // The first man in the set is a lineman, whose Draw row offers his
      // block; whatever the row's first line is, it is drawn the same way.
      await page
        .getByRole("group", { name: "Draw by hand" })
        .getByRole("button")
        .first()
        .tap();
      // The sheet goes so the field is there to draw on.
      await expect(page.locator("[data-drawing-preview]")).toHaveCount(1);
      await page.touchscreen.tap(start.x, start.y - 40);
      await page.touchscreen.tap(start.x + 40, start.y - 40);
      await page.getByRole("button", { name: "Finish the route — ⏎" }).tap();
      await expect(page.locator("[data-drawing-preview]")).toHaveCount(0);
      await expect(page.locator("[data-scene-path]")).toHaveCount(routes + 1);
      await expectSavedOnThisDevice(page);

      await page
        .locator("header.topbar")
        .getByRole("button", { name: "Undo", exact: true })
        .tap();
      await expect(page.locator("[data-scene-path]")).toHaveCount(routes);
      await page
        .locator("header.topbar")
        .getByRole("button", { name: "Redo", exact: true })
        .tap();
      await expect(page.locator("[data-scene-path]")).toHaveCount(routes + 1);
      await expectSavedOnThisDevice(page);

      // A reload — what a phone browser does to a page the Coach left for
      // another app — opens on the same Play, ready to draw, with no
      // read-only stop on the way back in.
      await page.reload();
      await waitForPhoneWorkspace(page);
      await expect(
        page.getByRole("textbox", { name: "Play name" }),
      ).toHaveValue("Phone draft", { timeout: 30_000 });
      await expect(page.getByText("Read only", { exact: true })).toHaveCount(0);
      await expect(page.locator("[data-scene-player]")).toHaveCount(11);
      await expect(page.locator("[data-scene-path]")).toHaveCount(routes + 1);
    });

    test("gives a picked man his routes from a tray above the tools", async ({
      page,
    }) => {
      await enterEditor(page);
      const tray = page.getByRole("navigation", { name: "Quick calls" });
      await expect(tray).toHaveCount(0);

      // Tap the quarterback, who carries no route in the seeded Play.
      const routes = await page.locator("[data-scene-path]").count();
      const symbol = page
        .locator("[data-scene-player='q']")
        .locator("circle, rect, path")
        .first();
      const at = (await symbol.boundingBox())!;
      await page.touchscreen.tap(at.x + at.width / 2, at.y + at.height / 2);
      await expect(tray).toBeVisible();
      await expect(tray.getByText("Q · Routes")).toBeVisible();

      // The tray is a row on the glass, above the tools, with thumb-sized
      // pills — the first ones without a scroll.
      const trayBox = await insideViewport(page, tray, viewport);
      const toolsBox = await insideViewport(
        page,
        page.getByRole("navigation", { name: "Drawing tools" }),
        viewport,
      );
      expect(trayBox.y + trayBox.height).toBeLessThanOrEqual(toolsBox.y + 1);
      const slant = tray.getByRole("button", { name: "Slant" });
      const slantBox = await insideViewport(page, slant, viewport);
      expect(slantBox.height).toBeGreaterThanOrEqual(44);
      expect(slantBox.width).toBeGreaterThanOrEqual(44);

      // One tap draws the route and marks the pill as his.
      await slant.tap();
      await expect(page.locator("[data-scene-path]")).toHaveCount(routes + 1);
      await expect(slant).toHaveAttribute("aria-pressed", "true");
      await expectSavedOnThisDevice(page);

      // A quick route chosen in the sheet closes the sheet: the field is the
      // answer, and the tray is there for the next one.
      await page.getByRole("button", { name: "Inspector", exact: true }).tap();
      const sheet = page.getByRole("complementary", { name: "Play inspector" });
      await expect(sheet).toBeVisible();
      await sheet.getByRole("button", { name: "Curl" }).tap();
      await expect(sheet).toHaveCount(0);
      await expect(tray.getByRole("button", { name: "Curl" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.locator("[data-scene-path]")).toHaveCount(routes + 1);
    });

    test("moves a picked man under a finger that lands a little high, and still draws from his dot", async ({
      page,
    }) => {
      await enterEditor(page);
      const routes = await page.locator("[data-scene-path]").count();
      // The Z, split out alone: held sideways, the tray that opens for a
      // picked man lands where the quarterback was, under the lifting finger,
      // and nobody stands within a finger's reach of the Z.
      const man = page.locator("[data-scene-player='z']");
      const centerOf = async () => {
        const at = (await man
          .locator("circle, rect, path")
          .first()
          .boundingBox())!;
        return { x: at.x + at.width / 2, y: at.y + at.height / 2 };
      };
      const picked = await centerOf();
      await page.touchscreen.tap(picked.x, picked.y);
      // Picking him brings up his tray, and the field fits itself to what is
      // left of the stage — so he is found again once it has settled.
      await expect(page.locator('[data-route-dot="z"]')).toHaveCount(1);
      const dot = page.locator(".route-dot");
      await expect(dot).toBeVisible();
      let center = await centerOf();
      await expect
        .poll(async () => {
          const was = center;
          center = await centerOf();
          return Math.hypot(center.x - was.x, center.y - was.y);
        })
        .toBeLessThan(0.5);
      // The dot sits clear of where a finger on him lands, about twice as far
      // up as it used to.
      const mark = (await dot.boundingBox())!;
      expect(center.y - (mark.y + mark.height)).toBeGreaterThanOrEqual(18);

      // A thumb comes down a touch above his middle, under the handle's
      // target, and drags him in from the sideline: he moves, and nothing is
      // drawn.
      const before = await man.getAttribute("transform");
      const press = { x: center.x, y: center.y - 14 };
      expect(
        await page.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.getAttribute("class"),
          press,
        ),
      ).toBe("route-dot-hit");
      await fingerDrag(page, 81, press, { x: press.x - 50, y: press.y });
      await expect(page.locator("[data-drawing-preview]")).toHaveCount(0);
      await expect(man).not.toHaveAttribute("transform", before!);
      await expect(page.locator("[data-scene-path]")).toHaveCount(routes);

      // The dot itself still starts his route.
      const moved = (await dot.boundingBox())!;
      const grip = {
        x: moved.x + moved.width / 2,
        y: moved.y + moved.height / 2,
      };
      await fingerDrag(page, 82, grip, { x: grip.x + 40, y: grip.y - 60 });
      await expect(page.locator("[data-drawing-preview]")).toHaveCount(1);
    });

    test("puts the blue dot away when a tap on the grass clears the field", async ({
      page,
    }) => {
      await enterEditor(page);
      const routes = await page.locator("[data-scene-path]").count();
      // The Y, not the quarterback: held sideways, the tray that opens for a
      // picked man lands where the quarterback was, under the lifting finger.
      // The Y stands clear of anyone a finger could take for him.
      const symbol = page
        .locator("[data-scene-player='y']")
        .locator("circle, rect, path")
        .first();
      const at = (await symbol.boundingBox())!;
      await page.touchscreen.tap(at.x + at.width / 2, at.y + at.height / 2);
      const dot = page.locator("[data-route-dot]");
      await expect(page.locator('[data-route-dot="y"]')).toHaveCount(1);

      // A route from his dot: the dot, a break, Done. He is measured again,
      // because the tray moved the field when it opened.
      const moved = (await symbol.boundingBox())!;
      const start = {
        x: moved.x + moved.width / 2,
        y: moved.y + moved.height / 2,
      };
      const handle = (await page.locator(".route-dot").boundingBox())!;
      await page.touchscreen.tap(
        handle.x + handle.width / 2,
        handle.y + handle.height / 2,
      );
      await expect(page.locator("[data-drawing-preview]")).toHaveCount(1);
      await page.touchscreen.tap(start.x + 40, start.y - 50);
      await page.getByRole("button", { name: "Finish the route — ⏎" }).tap();
      await expect(page.locator("[data-drawing-preview]")).toHaveCount(0);
      await expect(page.locator("[data-scene-path]")).toHaveCount(routes + 1);

      // A tap on bare grass puts everything down, the dot with it: a finger
      // never hovered him, so nothing is left offering it. The low corner,
      // because the note that the play changed rides along the top.
      const field = (await page
        .locator("svg.field-diagram")
        .first()
        .boundingBox())!;
      await page.touchscreen.tap(field.x + 16, field.y + field.height - 16);
      await expect(page.locator("[data-selected-path]")).toHaveCount(0);
      await expect(page.locator("[data-scene-player].selected")).toHaveCount(0);
      await expect(dot).toHaveCount(0);
    });

    test("keeps an update notice's action whole inside the width", async ({
      page,
    }) => {
      await enterEditor(page);
      await page.evaluate(() => {
        const stage = document.querySelector(".editor-stage");
        if (!stage) throw new Error("No stage.");
        const host = document.createElement("div");
        host.className = "lifecycle-notices";
        host.innerHTML =
          '<div class="notice update" role="status"><span data-notice-text>A new version of Chalk is ready. Your saved work stays on this device.</span><button type="button">Update now</button></div>';
        stage.prepend(host);
      });
      const text = await insideViewport(
        page,
        page.locator("[data-notice-text]"),
        viewport,
      );
      const action = await insideViewport(
        page,
        page.getByRole("button", { name: "Update now" }),
        viewport,
      );
      const overlap =
        action.x < text.x + text.width &&
        text.x < action.x + action.width &&
        action.y < text.y + text.height &&
        text.y < action.y + action.height;
      expect(overlap).toBe(false);
    });
  });
}

test.describe("phone workspace at 400×496", () => {
  test.use({
    viewport: { width: 400, height: 496 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });

  test("opens straight into the editor with the destinations and the save state on the glass", async ({
    page,
  }) => {
    await enterEditor(page);
    await expect(page.getByText("Read only", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Edit on this screen" }),
    ).toHaveCount(0);
    const viewport = { width: 400, height: 496 };
    await insideViewport(page, page.locator("header.topbar"), viewport);
    await insideViewport(
      page,
      page.getByRole("navigation", { name: "Workspace views" }),
      viewport,
    );
    await insideViewport(
      page,
      page.getByRole("textbox", { name: "Play name" }),
      viewport,
    );
    // The save state is there from the first frame (#97).
    await expectSavedOnThisDevice(page);
  });
});

/**
 * The first launch on a phone (issue #96): no seed, no fixture — a blank
 * device, a formation, a name, a route, a save, a reload, and the Play is
 * there to pick up again.
 */
blankTest.describe("first launch on a phone at 390×844", () => {
  blankTest.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });

  blankTest(
    "saves the first play by touch and finds it after a reload",
    async ({ page }) => {
      const failures: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") failures.push(message.text());
      });
      await enterEditor(page);
      await expect(
        page.getByRole("textbox", { name: "Play name" }),
      ).toHaveValue("Untitled play");
      await expect(page.locator("[data-scene-player]")).toHaveCount(0);

      await page.getByRole("button", { name: "Inspector", exact: true }).tap();
      await page.getByTitle("Browse formations — ⇧⌘F").tap();
      await page
        .getByRole("dialog", { name: "Formations" })
        .getByText("Gun Doubles Right", { exact: true })
        .tap();
      await expect(page.locator("[data-scene-player]")).toHaveCount(11);
      await expect(
        page.getByRole("complementary", { name: "Play inspector" }),
      ).toHaveCount(0);

      const name = page.getByRole("textbox", { name: "Play name" });
      await name.fill("First play on a phone");
      await name.press("Enter");
      await expectSavedOnThisDevice(page);

      const symbol = page
        .locator("[data-scene-player]")
        .first()
        .locator("circle, rect, path")
        .first();
      const at = (await symbol.boundingBox())!;
      const start = { x: at.x + at.width / 2, y: at.y + at.height / 2 };
      await page.touchscreen.tap(start.x, start.y);
      await page.getByRole("button", { name: "Inspector", exact: true }).tap();
      // The first man in the set is a lineman, whose Draw row offers his
      // block; whatever the row's first line is, it is drawn the same way.
      await page
        .getByRole("group", { name: "Draw by hand" })
        .getByRole("button")
        .first()
        .tap();
      await expect(page.locator("[data-drawing-preview]")).toHaveCount(1);
      await page.touchscreen.tap(start.x, start.y - 40);
      await page.getByRole("button", { name: "Finish the route — ⏎" }).tap();
      await expect(page.locator("[data-scene-path]")).toHaveCount(1);
      await expectSavedOnThisDevice(page);
      expect(failures).toEqual([]);

      await page.reload();
      await waitForPhoneWorkspace(page);
      await expect(
        page.getByRole("textbox", { name: "Play name" }),
      ).toHaveValue("First play on a phone", { timeout: 30_000 });
      await expect(page.locator("[data-scene-player]")).toHaveCount(11);
      await expect(page.locator("[data-scene-path]")).toHaveCount(1);
      await expectSavedOnThisDevice(page);
    },
  );
});
