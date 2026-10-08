import { expect, test } from "./fixtures";
import { addDefense, openDefense, savedPlay } from "./defense-helpers";

test.use({ viewport: { width: 390, height: 844 } });

test("phone tips and defensive controls stay reachable at narrow widths", async ({
  page,
}, info) => {
  await page.goto("/");
  await addDefense(page);
  await page
    .getByRole("combobox", { name: "Workspace view", exact: true })
    .selectOption("Tips");
  await expect(
    page.getByRole("heading", { name: "Defensive tips", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run defense", exact: true }).tap();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Apply setup", exact: true }).tap();
  await expect
    .poll(
      async () =>
        (await savedPlay(page)).players.filter(
          (p) => p.defensiveTechnique?.showBlitzFromDepth !== undefined,
        ).length,
    )
    .toBe(3);
  await page
    .getByRole("button", { name: "Show all assignments", exact: true })
    .tap();
  const dialog = await openDefense(page);
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await dialog.evaluate((node) => ({
      width: node.getBoundingClientRect().width,
      scroll: node.scrollWidth,
      client: node.clientWidth,
    }));
    expect(bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.client + 1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog
    .getByRole("combobox", { name: "Offense read key", exact: true })
    .selectOption("option");
  await expect(
    dialog.getByRole("combobox", { name: "Offense read key", exact: true }),
  ).toHaveValue("option");
  await dialog
    .getByRole("combobox", { name: "Offense read key", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("phone-read-controls.png") });
  await dialog
    .getByRole("button", { name: "Defensive tips", exact: true })
    .tap();
  await page
    .getByRole("button", { name: "Reads & scramble", exact: true })
    .tap();
  await expect(page.getByRole("article")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("phone-defensive-tips.png") });
});
