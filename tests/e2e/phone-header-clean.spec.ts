import { closePlayName, expect, playNameField, test } from "./fixtures";

/**
 * The phone header reads clean: a sidebar icon leads, the view picker sits
 * on the header's own surface, the row names the side of the ball but not
 * the play — its name heads the drawer — and a plus opens New play's two
 * choices. Undo and Redo are icons on the row from 436 px, in More below. Ends on
 * header screenshots at fixed widths and one of the New play panel.
 */
test.use({ hasTouch: true, isMobile: true });
test("names the unit, leaves the play's name to the drawer and starts a play from a plus", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 440, height: 956 });
  await page.goto("/");
  const header = page.getByRole("banner");

  const open = header.getByRole("button", { name: "Open the sidebar" });
  await expect(open.locator("svg")).toBeVisible();
  await expect(open).toHaveText("");

  const picker = header.getByRole("combobox", { name: "Workspace view" });
  await expect(picker).toBeVisible();
  for (const surface of [
    header.getByRole("navigation", { name: "Workspace views" }),
    picker,
  ]) {
    await expect(surface).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  }
  await expect(picker).toHaveCSS("appearance", "none");

  // The row says which side of the ball, and nothing names the play.
  const unit = header.locator(".play-unit");
  await expect(unit).toBeVisible();
  await expect(unit).toHaveText("Offense");
  await expect(header.getByRole("textbox", { name: "Play name" })).toHaveCount(
    0,
  );

  // The play's name heads the drawer's This play, and renames it there.
  const name = await playNameField(page);
  await expect(
    page.getByRole("navigation", { name: "Sidebar" }).locator(".sidebar-name"),
  ).toBeVisible();
  await name.fill("Trips Right Mesh");
  await name.press("Enter");
  await closePlayName(page);

  // Undo and Redo are icons on the row, so More does not repeat them.
  for (const label of ["Undo", "Redo"]) {
    const command = header.getByRole("button", { name: label, exact: true });
    await expect(command).toBeVisible();
    await expect(command.locator("svg")).toBeVisible();
    await expect(command).toHaveText("");
  }
  await header.getByRole("button", { name: "Undo", exact: true }).tap();
  await expect(await playNameField(page)).not.toHaveValue("Trips Right Mesh");
  await closePlayName(page);
  await header.getByRole("button", { name: "Redo", exact: true }).tap();
  await expect(await playNameField(page)).toHaveValue("Trips Right Mesh");
  await closePlayName(page);
  await header.getByRole("button", { name: "More actions" }).tap();
  const more = page.locator(".more-panel");
  await expect(more.getByRole("button", { name: "Undo" })).toBeHidden();
  await expect(
    more.getByRole("button", { name: /^New (offensive|defensive) play/ }),
  ).toHaveCount(0);
  await header.getByRole("button", { name: "More actions" }).tap();
  await header.screenshot({ path: info.outputPath("phone-header-440.png") });

  // The plus is an icon that opens a small panel of the two new plays,
  // inside the glass under the header.
  const plus = header.getByRole("button", { name: "New play", exact: true });
  await expect(plus.locator("svg")).toBeVisible();
  await expect(plus).toHaveText("");
  await plus.tap();
  const start = page.getByRole("group", { name: "New play" });
  await expect(start).toBeVisible();
  const panel = (await start.boundingBox())!;
  const bar = (await header.boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(440);
  expect(panel.y).toBeGreaterThanOrEqual(bar.y + bar.height - 4);
  expect(panel.width).toBeLessThanOrEqual(240);
  await page.screenshot({
    path: info.outputPath("phone-new-play-440.png"),
    clip: { x: 0, y: 0, width: 440, height: 240 },
  });

  // A defensive play says so.
  await start.getByRole("button", { name: /^New defensive play/ }).tap();
  await expect(start).toHaveCount(0);
  await expect(unit).toHaveText("Defense");
  // A new defense opens on the Defenses picker; the field stays blank.
  const defenses = page.getByRole("dialog", { name: "Defenses" });
  await expect(defenses).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(defenses).toBeHidden();
  await header.screenshot({
    path: info.outputPath("phone-header-440-defense.png"),
  });

  // Too narrow for the pair: More carries it instead, and the plus stays.
  await page.setViewportSize({ width: 402, height: 874 });
  await expect(
    header.getByRole("button", { name: "Undo", exact: true }),
  ).toBeHidden();
  await expect(plus).toBeVisible();
  await header.getByRole("button", { name: "More actions" }).tap();
  await expect(more.getByRole("button", { name: "Undo" })).toBeVisible();
  await header.getByRole("button", { name: "More actions" }).tap();
  await header.screenshot({ path: info.outputPath("phone-header-402.png") });
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(plus).toBeVisible();
  await header.screenshot({ path: info.outputPath("phone-header-360.png") });
});
