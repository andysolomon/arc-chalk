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

  await bar.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    bar.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => x.getAttribute("transform"), { timeout: 4000 })
    .not.toBe(stance);

  await bar.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    bar.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-scene-trail]").first()).toBeVisible();

  await page
    .getByRole("list", { name: "Everything on the field" })
    .getByRole("button", { name: "X route" })
    .press("Enter");
  await expect(page.getByText("Timing")).toBeVisible();
  await expect(page.getByLabel("Delay")).toBeEnabled();

  await bar.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(x).toHaveAttribute("transform", stance!);
});

test("space plays and pauses in Present", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Present" }).click();
  const present = page.getByRole("region", { name: "Present" });
  await expect(present).toBeVisible();
  const bar = present.getByLabel("Playback controls");
  await expect(bar).toBeVisible();

  await page.keyboard.press(" ");
  await expect(
    bar.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.keyboard.press(" ");
  await expect(
    bar.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
});
