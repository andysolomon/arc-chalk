import { expect, test } from "./fixtures";

/**
 * Issue #66: a Game Plan is a curated, numbered view of the library. It is
 * kept on the device, prepared into a frozen revision, and the call sheet
 * reads that revision. A reload must find all of it again.
 */
test("builds a game plan from the library, prepares it, and keeps it across reload", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByText(/^Library/)).toBeVisible();

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Game plans…" }).click();
  const workspace = page.getByRole("dialog", { name: "Game plans" });
  await expect(workspace).toBeVisible();

  await workspace.getByRole("button", { name: "New plan" }).click();
  await workspace.getByLabel("Plan name").fill("Week 3");
  await workspace.getByLabel("Opponent").fill("Central");
  await workspace.getByRole("button", { name: "Create plan" }).click();
  await expect(
    workspace.getByRole("button", { name: "Openers", exact: true }),
  ).toBeVisible();

  // Pick from the library with the count stated before anything is added.
  const stick = workspace.getByRole("checkbox", { name: /^Stick — Thunder$/ });
  await stick.check();
  await workspace.getByRole("checkbox", { name: /^Four Verticals/ }).check();
  await expect(workspace.locator("[data-preview]")).toContainText(
    "2 new calls",
  );
  await workspace.getByRole("button", { name: /^Add 2 to plan/ }).click();
  await expect(
    workspace.getByLabel("Call number for Stick — Thunder"),
  ).toBeVisible();

  const codes = workspace.getByLabel(/^Call number for/);
  await codes.first().fill("12");
  await codes.first().press("Enter");
  await codes.nth(1).fill("12");
  await codes.nth(1).press("Enter");
  await expect(
    workspace.getByText(/already a call in this plan/),
  ).toBeVisible();
  await codes.nth(1).fill("7");
  await codes.nth(1).press("Enter");

  await workspace.getByRole("button", { name: "Prepare for game" }).click();
  await expect(workspace.getByText(/^Prepared/)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("game-plan-editor.png"),
    fullPage: false,
  });

  const popup = page.waitForEvent("popup");
  await workspace.getByRole("button", { name: "Call sheet" }).click();
  const sheet = await popup;
  await expect(sheet.locator("body")).toContainText("Week 3");
  await expect(sheet.locator("body")).toContainText("12");
  await expect(sheet.locator("body")).toContainText("Stick — Thunder");
  await sheet.close();

  await page.reload();
  await expect(page.getByText(/^Library/)).toBeVisible();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Game plans…" }).click();
  const again = page.getByRole("dialog", { name: "Game plans" });
  await again.getByRole("button", { name: /^Week 3 /, exact: false }).click();
  await expect(again.getByLabel(/^Call number for/).first()).toHaveValue("12");
  await expect(again.getByText(/^Prepared/)).toBeVisible();
});
