import { expect, test } from "@playwright/test";

test("keeps local save and Account available without Clerk or Convex", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible();
  await expect(page.locator("[data-sync-status]")).toHaveAttribute(
    "data-sync-status",
    "local",
  );

  const playName = page.getByRole("textbox", { name: "Play name" });
  await playName.fill("Local-only save");
  await playName.press("Enter");
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Local-only save football play" }),
  ).toBeVisible();

  await page.getByTitle("More actions").click();
  await page.getByRole("button", { name: "Account" }).click();
  await expect(
    page.getByText(
      "Cloud sign-in is not configured. Editing on this device still works.",
    ),
  ).toBeVisible();
});
