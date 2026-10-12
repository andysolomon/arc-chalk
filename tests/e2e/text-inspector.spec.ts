import { type Page } from "@playwright/test";

import { expect, openBlankEditor, test } from "./fixtures";

/**
 * A note the Coach writes or picks on its own brings out its Text panel
 * wherever the inspector was: a desktop's folded inspector comes back, and a
 * tablet's drawer opens over the field. Without it, a note placed with the
 * Text tool could not be typed into, and a note picked had nowhere to show
 * what it says. The phone's sheet is phone-text-inspector.spec. The Text
 * panel with the note retyped is the run's artifact.
 */

/** Places a note with the Text tool in the middle of the field. */
const placeNote = async (page: Page) => {
  await page.getByRole("button", { name: "Text — T" }).click();
  const box = (await page.locator("svg.field-diagram").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 3);
};

/** Clicks the one note on the field. */
const pickNote = async (page: Page) => {
  const box = (await page.locator("[data-scene-label]").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

const layouts = [
  {
    name: "desktop",
    viewport: { width: 1440, height: 960 },
    // The Coach folds the docked inspector before he writes anything.
    fold: async (page: Page) => {
      await page
        .getByRole("complementary", { name: "Play inspector" })
        .getByRole("button", { name: "Hide the inspector" })
        .click();
    },
  },
  {
    name: "tablet drawer",
    viewport: { width: 834, height: 1194 },
    // Below the docked floor the drawer starts closed.
    fold: async () => {},
  },
] as const;

for (const { name, viewport, fold } of layouts) {
  test.describe(name, () => {
    test.use({ viewport });

    test("brings out the Text panel for a note placed and for a note picked", async ({
      page,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== "chromium",
        "One engine walks both layouts; the iPad project docks at its own width.",
      );
      await openBlankEditor(page);
      const inspector = page.getByRole("complementary", {
        name: "Play inspector",
      });
      await fold(page);
      await expect(inspector).toHaveCount(0);

      // Placed: the panel is out and the Coach is already typing the note.
      await placeNote(page);
      await expect(page.locator("[data-scene-label]")).toHaveCount(1);
      const text = inspector.getByRole("textbox", { name: "Label text" });
      await expect(text).toBeFocused();
      await expect(text).toHaveValue("5 Yds");
      await page.keyboard.type("MAX SPLIT");
      await expect(page.locator("svg.field-diagram")).toContainText(
        "MAX SPLIT",
      );

      // Back to the play and put away, then picked again on the field: the
      // panel comes back on it.
      await inspector.getByRole("button", { name: "Back to the play" }).click();
      await inspector
        .getByRole("button", { name: "Hide the inspector" })
        .click();
      await expect(inspector).toHaveCount(0);
      await pickNote(page);
      await expect(text).toHaveValue("MAX SPLIT");
      await text.fill("CRACK");
      await expect(page.locator("svg.field-diagram")).toContainText("CRACK");

      await inspector.screenshot({
        path: testInfo.outputPath(
          `text-inspector-${name.replace(" ", "-")}.png`,
        ),
      });
    });
  });
}
