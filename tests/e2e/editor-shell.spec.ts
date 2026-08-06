import { expect, test } from "@playwright/test";

const LOCAL_SAVE_BUDGET_MS = 50;

/**
 * The 50 ms budget is a Coach-device guarantee, and plan item 4.6 owns proving
 * it on the target devices. Shared CI runners are several times slower than any
 * supported device, so there they guard against gross regressions instead.
 */
const acknowledgementCeilingMs = process.env.CI ? 400 : LOCAL_SAVE_BUDGET_MS;

test("opens the original field-first editor shell and its modes", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Chalk");
  await expect(
    page.getByRole("navigation", { name: "Workspace views" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await expect(page.locator("[data-scene-path]")).toHaveCount(6);
  await expect(page.locator("[data-scene-label]")).toHaveCount(12);
  await expect(page.locator("[data-field-yard-line]")).toHaveCount(9);
  await expect(page.locator("[data-field-sideline]")).toHaveCount(2);
  await expect(page.locator("[data-field-minor-mark]")).toHaveCount(128);
  await expect(page.locator("[data-field-number]")).toHaveCount(8);
  await expect(
    page.getByRole("complementary", { name: "Play inspector" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Present" }).click();
  await expect(page.getByText("Present mode")).toBeVisible();

  await page.getByRole("button", { name: "Editor" }).click();
  await expect(
    page.getByRole("navigation", { name: "Drawing tools" }),
  ).toBeVisible();

  const playName = page.getByRole("textbox", { name: "Play name" });
  const localSave = page.getByRole("button", {
    name: "Saved on this device",
  });

  // The first save of a session also pays for module evaluation, opening
  // IndexedDB, and seeding the starter Playbook. The budget describes ongoing
  // editing, so warm up first and measure the save after that.
  await playName.fill("Warm-up save");
  await playName.press("Enter");
  await expect(localSave).toBeVisible();

  await playName.fill("Mesh — Alert");
  await playName.press("Enter");
  // The renamed Play paints when its commit starts, so waiting for it and then
  // for Saved reads this save's acknowledgement rather than the warm-up's.
  await expect(
    page.getByRole("img", { name: "Mesh — Alert football play" }),
  ).toBeVisible();
  await expect(localSave).toBeVisible();

  const durationMs = Number(
    await localSave.getAttribute("data-save-duration-ms"),
  );
  expect(durationMs).toBeGreaterThan(0);
  // Chalk always classifies its own acknowledgement against the 50 ms budget.
  await expect(localSave).toHaveAttribute(
    "data-save-within-budget",
    String(durationMs < LOCAL_SAVE_BUDGET_MS),
  );
  expect(durationMs).toBeLessThan(acknowledgementCeilingMs);

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Mesh — Alert",
  );
  await expect(
    page.getByRole("img", { name: "Mesh — Alert football play" }),
  ).toBeVisible();
});

test("undoes and redoes a Play edit across a reload", async ({ page }) => {
  await page.goto("/");

  const playName = page.getByRole("textbox", { name: "Play name" });
  const undo = page.getByRole("button", { name: "Undo" });
  const redo = page.getByRole("button", { name: "Redo" });

  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  await playName.fill("Mesh — Alert");
  await playName.press("Enter");
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();
  await expect(undo).toBeEnabled();
  await expect(undo).toHaveAttribute("title", "Undo Rename Play");

  await undo.click();
  await expect(playName).toHaveValue("Stick — Thunder");
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible();
  await expect(redo).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Stick — Thunder",
  );
  const redoAfterReload = page.getByRole("button", { name: "Redo" });
  await expect(redoAfterReload).toBeEnabled();
  await expect(redoAfterReload).toHaveAttribute("title", "Redo Rename Play");

  await redoAfterReload.click();
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Mesh — Alert",
  );
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Mesh — Alert",
  );
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
});

test("names a version and restores it after a reload", async ({ page }) => {
  await page.goto("/");

  const playName = page.getByRole("textbox", { name: "Play name" });
  const saved = page.getByRole("button", { name: "Saved on this device" });

  await page.getByRole("button", { name: "Versions" }).click();
  await page
    .getByRole("textbox", { name: "Version name" })
    .fill("Install week");
  await page.getByRole("button", { name: "Create version" }).click();
  await expect(page.getByText("Install week")).toBeVisible();

  await playName.fill("Thursday rewrite");
  await playName.press("Enter");
  await expect(
    page.getByRole("img", { name: "Thursday rewrite football play" }),
  ).toBeVisible();
  await expect(saved).toBeVisible();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Thursday rewrite",
  );

  // The named version outlived the session it was created in.
  await page.getByRole("button", { name: "Versions" }).click();
  await expect(page.getByText("Install week")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();

  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Stick — Thunder",
  );
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();

  // A restore is an ordinary edit, so the Coach can undo it.
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toHaveAttribute("title", "Undo Restore version");
  await undo.click();
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Thursday rewrite",
  );
});
