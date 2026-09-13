import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Issue #64: the idle inspector leads with the coach's next action and folds
 * the rest away, so a formation, a concept and an assignment are all within
 * reach without scrolling past print or library settings — on the desktop
 * the review measured and on an iPad in landscape, with a long play name
 * and dense coaching notes.
 */
const LONG_NAME =
  "Trips Right Slot Motion — Stick Thunder Alert Smash vs Two-High Shell (Red Zone Only)";
const DENSE_NOTE =
  "Win the apex, throttle at 6 vs zone, carry to the far hash vs man, eyes on the Mike the whole way";

async function longPlay(page: Page): Promise<void> {
  await page.goto("/");
  const name = page.getByRole("textbox", { name: "Play name" });
  await expect(name).toHaveValue("Stick — Thunder");
  await name.fill(LONG_NAME);
  await name.press("Enter");
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();
}

const inspectorFits = async (page: Page) => {
  const inspector = page.getByRole("complementary", { name: "Play inspector" });
  await expect(inspector).toBeVisible();
  // Nothing spills sideways, whatever the viewport.
  expect(
    await inspector.evaluate(
      (node) => node.scrollWidth <= node.clientWidth + 1,
    ),
  ).toBe(true);
  return inspector;
};

for (const [label, viewport] of [
  ["reviewed desktop", { width: 1363, height: 936 }],
  ["iPad landscape", { width: 1194, height: 834 }],
] as const) {
  test.describe(label, () => {
    test.use({ viewport });

    test("keeps formation, concept and the library heading in reach without scrolling", async ({
      page,
    }) => {
      await longPlay(page);
      const inspector = await inspectorFits(page);
      const box = (await inspector.boundingBox())!;
      const within = async (name: RegExp) => {
        const target = inspector.getByRole("button", { name });
        const rect = (await target.boundingBox())!;
        expect(rect.y).toBeGreaterThanOrEqual(box.y);
        expect(rect.y + rect.height).toBeLessThanOrEqual(box.y + box.height);
      };
      await within(/Browse formations|Custom alignment/);
      await within(/^No concept yet/);
      await within(/^No line call yet/);
      await within(/^Library/);
      // Print settings are folded, below, and not what the coach sees first.
      await expect(
        inspector.getByRole("button", { name: /^Print & export/ }),
      ).toHaveAttribute("aria-expanded", "false");
      await expect(
        inspector.getByRole("button", { name: "Half field" }),
      ).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath("idle.png") });
    });

    test("puts the assignment first on a selected route and takes a dense note", async ({
      page,
    }) => {
      await longPlay(page);
      await page
        .getByRole("list", { name: "Everything on the field" })
        .getByRole("button", { name: "X route" })
        .press("Enter");
      const inspector = await inspectorFits(page);
      const box = (await inspector.boundingBox())!;
      const assignment = inspector.getByRole("textbox", { name: "Assignment" });
      const rect = (await assignment.boundingBox())!;
      expect(rect.y + rect.height).toBeLessThanOrEqual(box.y + box.height);

      const note = inspector.getByRole("textbox", { name: "Coaching note" });
      await note.fill(DENSE_NOTE);
      await note.press("Tab");
      // The route panel keeps a note to 90 characters, as it always did.
      await expect(note).toHaveValue(DENSE_NOTE.slice(0, 90));
      // Line style and timing stay folded until asked for.
      await expect(inspector.getByLabel("Dashed")).toHaveCount(0);
      await expect(inspector.getByLabel("Delay")).toHaveCount(0);
      await inspector.getByRole("button", { name: /^Advanced/ }).click();
      await expect(inspector.getByLabel("Delay")).toBeVisible();
      await inspectorFits(page);
      await page.screenshot({ path: test.info().outputPath("route.png") });
    });
  });
}
