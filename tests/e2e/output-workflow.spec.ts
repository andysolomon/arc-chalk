import { expect, test } from "./fixtures";

/**
 * Issue #69: choose the source, choose the format, see the sheet, then
 * print — with the source, count and paper stated first, an empty source
 * explained, and a format that cannot take the source saying why.
 */
test("prints a game plan's call sheet from the workflow and keeps it under Recent", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.addInitScript(() => {
    // Headless print is a no-op; count the calls instead.
    (window as unknown as { __prints: number }).__prints = 0;
  });
  // A prepared plan to print from.
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Game plans…" }).click();
  const workspace = page.getByRole("region", { name: "Game plans" });
  await workspace.getByRole("button", { name: "New plan" }).click();
  await workspace.getByLabel("Plan name").fill("Week 3");
  await workspace.getByRole("button", { name: "Create plan" }).click();
  await workspace.getByRole("checkbox", { name: /^Stick — Thunder$/ }).check();
  await workspace.getByRole("checkbox", { name: /^Four Verticals/ }).check();
  await workspace.getByRole("button", { name: /^Add 2 to plan/ }).click();
  const codes = workspace.getByLabel(/^Call number for/);
  await codes.first().fill("12");
  await codes.first().press("Enter");
  await codes.nth(1).fill("7");
  await codes.nth(1).press("Enter");
  await workspace.getByRole("button", { name: "Prepare for game" }).click();
  await expect(workspace.getByText(/^Prepared/)).toBeVisible();
  await page.keyboard.press("Escape");

  await page
    .getByRole("banner")
    .getByRole("button", { name: "Print & export", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Print preview", exact: true })
    .click();
  const output = page.getByRole("region", { name: "Print & export" });
  const status = output.getByRole("status", { name: "What prints" });
  await expect(status).toContainText("Current play: Stick — Thunder");

  // An empty selection explains itself and never prints the library.
  await output.getByRole("radio", { name: "Selected plays" }).click();
  await output
    .getByRole("list", { name: "Plays to pick" })
    .getByLabel("Stick — Thunder", { exact: true })
    .uncheck();
  await expect(output.getByRole("alert")).toContainText(
    "Pick at least one play.",
  );
  await expect(output.getByRole("button", { name: "Print…" })).toBeDisabled();

  await output.getByRole("radio", { name: "Game plan" }).click();
  await output.getByRole("button", { name: /^Coordinator call sheet/ }).click();
  await expect(status).toContainText("Game plan: Week 3 · Offense · 2 plays");
  await expect(status).toContainText("prepared");
  await expect(status).toContainText("Letter landscape · 0.4 in margins");
  const preview = page.frameLocator('iframe[title="Preview"]');
  await expect(preview.locator("body")).toContainText("Week 3");
  await expect(preview.locator("body")).toContainText("12");
  await expect(status).toContainText(/\d+ page/);
  await page.screenshot({ path: testInfo.outputPath("output-workflow.png") });

  // The coordinator sheet is laid out here: template, sections, columns,
  // density and sides — and the preview follows.
  const layout = output.getByRole("group", { name: "Call sheet layout" });
  await expect(layout.getByRole("button", { name: "OC" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await layout.getByRole("button", { name: "Two sides" }).click();
  await expect(preview.locator("body")).toContainText("Side 1 of 2");
  await expect(status).toContainText("2 pages");
  await layout.getByLabel("Title for Openers").fill("Script");
  await expect(preview.locator("body")).toContainText("Script");
  await layout.getByRole("button", { name: "One side" }).click();

  // The wristband starts from the plan's own calls, to confirm, and prints
  // at the chosen size with its calibration bar.
  await output.getByRole("button", { name: /^Wristband/ }).click();
  const band = output.getByRole("group", { name: "Wristband inserts" });
  await expect(
    band.getByRole("list", { name: "Calls on the band" }).getByRole("listitem"),
  ).toHaveCount(2);
  await band.getByLabel("Size preset").selectOption("3x1.5-1x3");
  await expect(preview.locator("body")).toContainText(
    "print at 100 % (Actual size)",
  );
  await expect(preview.locator(".wc")).toHaveCount(2);
  await output.getByRole("button", { name: /^Coordinator call sheet/ }).click();

  // A format that takes one play says so and leaves the plan alone.
  await output.getByRole("button", { name: /^Install page/ }).click();
  await expect(output.getByRole("alert")).toContainText(
    "Install page is built from the current play or selected plays, not a game plan.",
  );
  await expect(status).toContainText("Game plan: Week 3");
  await output.getByRole("button", { name: /^Coordinator call sheet/ }).click();

  // The binder's page numbers come from the preview's own layout: the
  // contents fill in once measured, and the count agrees with the status.
  await output.getByRole("button", { name: /^Binder playbook/ }).click();
  await expect(preview.locator("[data-contents-for] .tp").first()).toHaveText(
    /^\d+$/,
  );
  const pages = await preview.locator("[data-book-page]").count();
  await expect(status).toContainText(`${pages} pages`);
  await expect(preview.locator(".pno").last()).toHaveText(String(pages));
  await output.getByRole("button", { name: /^Handout/ }).click();
  await expect(preview.locator(".hs.up2")).toHaveCount(1);
  await output.getByRole("button", { name: /^Coordinator call sheet/ }).click();

  await output.getByRole("button", { name: "Print…" }).click();
  await expect(output.getByRole("status", { name: "Outcome" })).toContainText(
    "Sent to print.",
  );

  await page.keyboard.press("Escape");
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Print & export", exact: true })
    .click();
  await expect(page.getByText("RECENT")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Coordinator call sheet — game plan" }),
  ).toBeVisible();
});
