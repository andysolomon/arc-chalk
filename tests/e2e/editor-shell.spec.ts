import { expect, test } from "@playwright/test";

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
  await playName.fill("Mesh — Alert");
  await playName.press("Enter");

  const localSave = page.getByRole("button", {
    name: "Saved on this device",
  });
  await expect(localSave).toHaveAttribute("data-save-within-budget", "true");
  const durationMs = Number(
    await localSave.getAttribute("data-save-duration-ms"),
  );
  expect(durationMs).toBeLessThan(50);

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
