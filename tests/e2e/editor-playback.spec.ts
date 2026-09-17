import { expect, test } from "./fixtures";

test("scrubs with Tab, arrow keys and bounded Home/End keys", async ({
  page,
}) => {
  await page.goto("/");
  const bar = page.getByLabel("Playback controls");
  await bar.getByRole("button", { name: "Play", exact: true }).focus();
  await page.keyboard.press("Tab");
  const slider = bar.getByRole("slider", { name: "Scrub the play" });
  await expect(slider).toBeFocused();
  const start = Number(await slider.getAttribute("aria-valuemin"));
  const end = Number(await slider.getAttribute("aria-valuemax"));
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", String(start + 100));
  await expect(slider).toHaveAttribute("aria-valuetext", /seconds/);
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", String(end));
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowLeft");
  await expect(slider).toHaveAttribute("aria-valuenow", String(start));
});

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
  // Timing folds under Advanced on the route panel (issue #64).
  await page
    .getByRole("button", { name: /^Advanced/, expanded: false })
    .click();
  await expect(page.getByText("Timing")).toBeVisible();
  await expect(page.getByLabel("Delay")).toBeEnabled();

  await bar
    .getByRole("button", { name: "Reset positions", exact: true })
    .click();
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

test("rewinds to the first frame once the play runs itself out", async ({
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
  const firstFrameMs = await bar.getAttribute("data-playback-time");

  await bar.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(async () => x.getAttribute("transform"), { timeout: 4000 })
    .not.toBe(stance);

  // Nobody presses anything: the play runs out and puts itself back.
  await expect(
    bar.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect(bar).toHaveAttribute("data-playback-time", firstFrameMs!);
  await expect(x).toHaveAttribute("transform", stance!);
});
