import { expect, test } from "@playwright/test";

test("plays the seeded Play and leaves it editable at a frozen frame", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible();

  const bar = page.getByLabel("Playback controls");
  await expect(bar).toBeVisible();
  const x = page.locator('[data-scene-player="x"]');
  const stance = await x.getAttribute("transform");

  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect
    .poll(async () => x.getAttribute("transform"), { timeout: 4000 })
    .not.toBe(stance);

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  await expect(page.locator("[data-scene-trail]").first()).toBeVisible();

  await page.locator('[data-scene-path="rx"]').click();
  await expect(page.getByText("Timing")).toBeVisible();
  await expect(page.getByLabel("Delay")).toBeEnabled();

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(x).toHaveAttribute("transform", stance!);
});

test("space plays and pauses in Present", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Present" }).click();
  const present = page.getByRole("region", { name: "Present" });
  await expect(present).toBeVisible();
  await expect(present.getByLabel("Playback controls")).toBeVisible();

  await page.keyboard.press(" ");
  await expect(present.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.keyboard.press(" ");
  await expect(present.getByRole("button", { name: "Play" })).toBeVisible();
});
