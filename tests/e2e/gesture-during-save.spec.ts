import type { Page } from "@playwright/test";

import { expect, openSeededEditor, test } from "./fixtures";

/**
 * A gesture the Coach makes while his last edit is still saving is built
 * against the Play as it will be when its turn runs. Built against the Play
 * on screen, it carries the whole route without the edit ahead of it, and
 * putting it back loses that edit (FindingGestureDuringSave, the bug
 * 4d7994b and b41f13d fixed for typing).
 */

/**
 * Every hash the page asks for waits this long from here on, so a save is
 * still in flight when the next gesture lands, as on a slow phone.
 */
async function slowEveryHash(page: Page): Promise<void> {
  await page.evaluate((delayMs) => {
    const subtle = globalThis.crypto.subtle;
    const digest = subtle.digest.bind(subtle);
    subtle.digest = async (...args: Parameters<SubtleCrypto["digest"]>) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return digest(...args);
    };
  }, 600);
}

async function pickXRoute(page: Page) {
  await page
    .getByRole("list", { name: "Everything on the field" })
    .getByRole("button", { name: "X route" })
    .press("Enter");
  return page.getByRole("complementary", { name: "Inspector" });
}

const saved = (page: Page) =>
  expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible({ timeout: 20_000 });

test("keeps a coaching note typed just before Flip", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await openSeededEditor(page);
  let inspector = await pickXRoute(page);
  await slowEveryHash(page);

  await inspector
    .getByRole("textbox", { name: "Coaching note" })
    .fill("eyes up at the break");
  await inspector.getByRole("button", { name: "Flip", exact: true }).click();
  await saved(page);
  await expect(page.getByRole("button", { name: "Undo" })).toHaveAttribute(
    "title",
    "Undo Flip route",
  );

  // Picked again, the field shows the note the Play holds, not a draft.
  inspector = await pickXRoute(page);
  await expect(
    inspector.getByRole("textbox", { name: "Coaching note" }),
  ).toHaveValue("eyes up at the break");
  await page.screenshot({ path: testInfo.outputPath("note-kept-by-flip.png") });
});

test("keeps a coaching note typed just before a nudge", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await openSeededEditor(page);
  let inspector = await pickXRoute(page);
  await slowEveryHash(page);

  await inspector
    .getByRole("textbox", { name: "Coaching note" })
    .fill("stem him inside");
  // Back on the field list, out of the text box, the arrow nudges the route.
  await page
    .getByRole("list", { name: "Everything on the field" })
    .getByRole("button", { name: "X route" })
    .focus();
  await page.keyboard.press("ArrowRight");
  await saved(page);

  // Picked again, the field shows the note the Play holds, not a draft.
  inspector = await pickXRoute(page);
  await expect(
    inspector.getByRole("textbox", { name: "Coaching note" }),
  ).toHaveValue("stem him inside");
  await page.screenshot({
    path: testInfo.outputPath("note-kept-by-nudge.png"),
  });
});
