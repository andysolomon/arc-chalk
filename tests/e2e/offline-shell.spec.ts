import { expect, test } from "@playwright/test";

test("keeps editing and tells the Coach when the network drops", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible();

  await context.setOffline(true);
  await expect(page.locator(".lifecycle-notices .notice.offline")).toHaveText(
    /Offline\. Everything you draw saves on this device/,
  );

  const playName = page.getByRole("textbox", { name: "Play name" });
  await playName.fill("Drawn with the network off");
  await playName.press("Enter");
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();

  await context.setOffline(false);
  await expect(page.locator(".lifecycle-notices .notice.offline")).toHaveCount(
    0,
  );
  await page.reload();
  await expect(
    page.getByRole("img", { name: "Drawn with the network off football play" }),
  ).toBeVisible();
});
