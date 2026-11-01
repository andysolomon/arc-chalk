import { expect, test } from "./fixtures";

/**
 * The phone header reads clean: a sidebar icon leads, the view picker sits
 * on the header's own surface, the play name says which side of the ball it
 * is, and Undo and Redo are icons on the row wherever the name keeps its
 * room. Ends on header screenshots at fixed widths.
 */
test.use({ hasTouch: true, isMobile: true });
test("leads with a sidebar icon, names the unit and keeps Undo on the row", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 402, height: 874 });
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

  const unit = header.locator(".play-unit");
  await expect(unit).toBeVisible();
  await expect(unit).toHaveText("Offense");

  // Undo and Redo are icons on the row, so More does not repeat them.
  for (const name of ["Undo", "Redo"]) {
    const command = header.getByRole("button", { name, exact: true });
    await expect(command).toBeVisible();
    await expect(command.locator("svg")).toBeVisible();
    await expect(command).toHaveText("");
  }
  const name = header.getByRole("textbox", { name: "Play name" });
  await name.fill("Trips Right Mesh");
  await name.press("Enter");
  await header.getByRole("button", { name: "Undo", exact: true }).tap();
  await expect(name).not.toHaveValue("Trips Right Mesh");
  await header.getByRole("button", { name: "Redo", exact: true }).tap();
  await expect(name).toHaveValue("Trips Right Mesh");
  await header.getByRole("button", { name: "More actions" }).tap();
  await expect(
    page.locator(".more-panel").getByRole("button", { name: "Undo" }),
  ).toBeHidden();
  await header.getByRole("button", { name: "More actions" }).tap();
  await header.screenshot({ path: info.outputPath("phone-header-402.png") });

  // A defensive play says so.
  await header.getByRole("button", { name: "More actions" }).tap();
  await page
    .locator(".more-panel")
    .getByRole("button", { name: /^New defensive play/ })
    .tap();
  await expect(unit).toHaveText("Defense");
  // A new defense opens on the Defenses picker; the field stays blank.
  const defenses = page.getByRole("dialog", { name: "Defenses" });
  await expect(defenses).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(defenses).toBeHidden();
  await header.screenshot({
    path: info.outputPath("phone-header-402-defense.png"),
  });

  // Too narrow for the pair beside the name: More carries it instead.
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(
    header.getByRole("button", { name: "Undo", exact: true }),
  ).toBeHidden();
  await header.getByRole("button", { name: "More actions" }).tap();
  await expect(
    page.locator(".more-panel").getByRole("button", { name: "Undo" }),
  ).toBeVisible();
  await header.getByRole("button", { name: "More actions" }).tap();
  await header.screenshot({ path: info.outputPath("phone-header-360.png") });
});
