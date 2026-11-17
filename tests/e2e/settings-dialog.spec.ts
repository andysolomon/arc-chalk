import { expect, openSeededEditor, openSettings, test } from "./fixtures";

/**
 * The Settings dialog: its tabs split into what belongs to this play and
 * what holds everywhere, each with an icon; the head says what the open tab
 * changes; Print & export picks a Page from pictures of each and a Type from
 * named options with what each one means. The choices hold when the dialog
 * is put away and opened again. The test ends with a screenshot of the
 * Print & export tab.
 */
test("Settings groups its tabs and picks Page and Type from labeled choices", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1280, height: 860 });
  await openSeededEditor(page);

  const settings = await openSettings(page);
  const tabs = settings.getByRole("tab");
  await expect(tabs).toHaveText([
    "Field",
    "Print & export",
    "History",
    "Playbook",
    "Appearance",
    "Account",
    "About",
  ]);
  await expect(settings.getByText("This play", { exact: true })).toBeVisible();
  await expect(settings.getByText("General", { exact: true })).toBeVisible();

  // The head names the tab and says what it changes, not what it is set to.
  await expect(settings.getByRole("heading", { level: 2 })).toHaveText("Field");
  await expect(
    settings.getByText("The hash marks this play is drawn on."),
  ).toBeVisible();

  // History with nothing named says how to get something there.
  await settings.getByRole("tab", { name: "History" }).click();
  await expect(settings.getByText("No snapshots yet")).toBeVisible();

  await settings.getByRole("tab", { name: "Print & export" }).click();
  await expect(
    settings.getByRole("tab", { name: "Print & export" }),
  ).toHaveAttribute("aria-selected", "true");
  const page_ = settings.getByRole("region", { name: "Page" });
  const type = settings.getByRole("region", { name: "Type" });
  await expect(page_.getByRole("button")).toHaveCount(5);
  await expect(type.getByRole("button")).toHaveCount(3);

  await page_.getByRole("button", { name: "Half field" }).click();
  await expect(
    page_.getByRole("button", { name: "Half field" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page_.getByRole("button", { name: "Full field" }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("[data-field-yard-line]")).toHaveCount(7);

  const player = type.getByRole("button", { name: "Player", exact: true });
  await expect(player).toHaveAccessibleDescription(
    "Bigger type, assignments only — what a player reads across a room.",
  );
  await player.click();
  await expect(player).toHaveAttribute("aria-pressed", "true");
  await expect(
    type.getByRole("button", { name: "Coach", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");

  // Put away and opened again, the dialog keeps the tab and both choices.
  await settings.getByRole("button", { name: "Close" }).click();
  await expect(settings).toHaveCount(0);
  const again = await openSettings(page);
  await expect(again.getByRole("heading", { level: 2 })).toHaveText(
    "Print & export",
  );
  await expect(
    again.getByRole("button", { name: "Half field" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    again.getByRole("button", { name: "Player", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  await again.screenshot({
    path: testInfo.outputPath("settings-print-export.png"),
  });
});
