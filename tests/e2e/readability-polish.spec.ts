import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Issue #167: the smaller readability items a Coach comparing Chalk with his
 * old tools notices first. Each test ends on a screenshot of the surface it
 * checks, from the seeded starter book at the desktop project's fixed
 * 1440×960 viewport, so a rerun on the same commit redraws the same picture.
 */
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "Desktop chrome; the phone and iPad layouts have their own specs.",
);

const centreY = async (locator: Locator): Promise<number> => {
  const box = (await locator.boundingBox())!;
  return box.y + box.height / 2;
};

test("the concept picker's Show filter is chips and its stars sit on the row", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Concept ›/ }).click();
  const picker = page.getByRole("dialog", { name: "Concepts and line calls" });
  const show = picker.locator(".browser-filter");
  const chips = show.getByRole("button");
  await expect(chips).toHaveText(["All", "Concepts", "Line calls"]);

  // Chips, as every other filter in the app draws them: a rounded, bordered
  // pill with the pick filled in — not three words of body text.
  for (const chip of await chips.all()) {
    await expect(chip).toHaveClass(/\bchip\b/);
    const style = await chip.evaluate((node) => {
      const css = getComputedStyle(node);
      return {
        radius: parseFloat(css.borderTopLeftRadius),
        size: parseFloat(css.fontSize),
      };
    });
    expect(style.radius).toBeGreaterThan(0);
    expect(style.size).toBeLessThanOrEqual(12);
  }
  // Opened from the Concept row, the picker starts on Concepts.
  await expect(show.getByRole("button", { name: "Concepts" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(show.locator(".chip.active")).toHaveText("Concepts");
  await show.getByRole("button", { name: "Line calls" }).click();
  await expect(
    show.getByRole("button", { name: "Line calls" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(picker.locator(".menu-head")).toHaveText(["LINE CALLS"]);
  await show.getByRole("button", { name: "All", exact: true }).click();

  // Each star is centred on its own row, not dropped below the name.
  const rows = picker.locator(".preset-row");
  for (const index of [0, 3]) {
    const row = rows.nth(index);
    const drift =
      (await centreY(row.locator(".preset-star"))) -
      (await centreY(row.locator(".preset-name")));
    expect(Math.abs(drift)).toBeLessThanOrEqual(1);
  }
  await rows.first().locator(".preset-star").click();
  await expect(picker.locator(".menu-head").first()).toHaveText("FAVORITES");

  await picker.screenshot({ path: testInfo.outputPath("concept-picker.png") });
});

test("a formation card draws the set in the middle of a card cut to its shape", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByTitle("Browse formations — ⇧⌘F").click();
  const book = page.getByRole("dialog", { name: "Formations" });
  const pictures = book.locator(".browser-shape svg");
  await expect(pictures.first()).toBeVisible();

  const shapes = await pictures.evaluateAll((svgs) =>
    svgs.map((svg) => {
      const frame = (svg as SVGSVGElement).viewBox.baseVal;
      const ys = [...svg.querySelectorAll("circle")].flatMap((circle) => {
        const box = circle.getBBox();
        return [box.y, box.y + box.height];
      });
      return {
        aspect: frame.height / frame.width,
        top: Math.min(...ys),
        bottom: frame.height - Math.max(...ys),
      };
    }),
  );
  expect(shapes.length).toBeGreaterThan(4);
  for (const shape of shapes) {
    // As much room above the set as below it.
    expect(Math.abs(shape.top - shape.bottom)).toBeLessThanOrEqual(1);
    // And not a card that is mostly empty grass.
    expect(shape.aspect).toBeLessThan(0.4);
  }

  await book.screenshot({ path: testInfo.outputPath("formation-cards.png") });
});

test("Share Link says it needs an account before it is pressed", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Share & assets" }).click();
  const create = page.getByRole("button", { name: "Create Share Link" });
  // The end-to-end build has no account configured.
  await expect(create).toBeDisabled();
  await expect(create).toHaveAccessibleDescription(
    "Sharing needs an account. Images and Film References still stay on this device.",
  );
  await expect(
    page.getByText("Sharing needs an account.", { exact: false }),
  ).toBeVisible();

  const block = page.locator(".share-assets-block", {
    has: page.getByRole("heading", { name: "Share Link" }),
  });
  await block.screenshot({ path: testInfo.outputPath("share-link.png") });
});

const statusHint = (page: Page) => page.locator(".statusbar > span").first();

test("the status bar only calls labels small when they are, and never hidden", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible();
  // At 100 % the route labels are drawn and readable; the bar says nothing
  // about them.
  await expect(statusHint(page)).not.toBeEmpty();
  await expect(statusHint(page)).not.toContainText("labels");

  // Stood well back, they are small, and it says so — truthfully.
  const zoomOut = page.getByRole("button", { name: "Zoom out" });
  for (let step = 0; step < 6; step += 1) {
    if ((await statusHint(page).textContent())?.includes("labels")) break;
    await zoomOut.click();
  }
  await expect(statusHint(page)).toContainText(
    "labels are small — zoom in to read them",
  );
  await expect(statusHint(page)).not.toContainText("hidden");
  await expect(page.locator("[data-scene-label]").first()).toBeVisible();

  await page
    .locator(".statusbar")
    .screenshot({ path: testInfo.outputPath("status-bar.png") });
});

test("the sidebar counts a plan made on the Playbooks page", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const plans = page
    .getByRole("navigation", { name: "Sidebar" })
    .getByRole("button", { name: /^Game plans/ });
  await expect(plans).toHaveAccessibleName("Game plans, 0");

  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Playbooks", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Book pages" })
    .getByRole("button", { name: "Game plans", exact: true })
    .click();
  const workspace = page.getByRole("region", { name: "Game plans" });
  await workspace.getByRole("button", { name: "New plan" }).click();
  await workspace.getByLabel("Plan name").fill("Week 6");
  await workspace.getByRole("button", { name: "Create plan" }).click();
  // The new plan opens; its name is the Plan name field's value.
  await expect(
    workspace.getByRole("button", { name: "Back to game plans" }),
  ).toBeVisible();
  await expect(workspace.getByLabel("Plan name")).toHaveValue("Week 6");

  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Editor", exact: true })
    .click();
  await expect(plans).toHaveAccessibleName("Game plans, 1");

  await page
    .getByRole("navigation", { name: "Sidebar" })
    .screenshot({ path: testInfo.outputPath("sidebar-plans.png") });
});
