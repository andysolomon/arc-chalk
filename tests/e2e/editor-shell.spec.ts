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
});
