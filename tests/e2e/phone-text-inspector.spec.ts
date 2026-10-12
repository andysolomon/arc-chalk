import { expect, openBlankEditor, test } from "./fixtures";

/**
 * A note the Coach writes or taps on its own opens the phone's sheet full on
 * its Text panel: a placed note is typed into at once, and a tapped one shows
 * what it says without a trip to the sheet's handle. The sheet on the
 * retyped note is the run's artifact.
 */

test.use({ viewport: { width: 390, height: 844 } });

test("opens the sheet on the Text panel for a note placed and for a note tapped", async ({
  page,
}, testInfo) => {
  await openBlankEditor(page);
  await expect(page.locator(".chalk-shell.phone-workspace")).toBeVisible();
  const sheet = page.getByRole("complementary", { name: "Play inspector" });
  await expect(sheet).toHaveAttribute("data-sheet", "peek");

  // Placed: the sheet is full on the note and the caret is in it.
  await page.getByRole("button", { name: "Text — T" }).tap();
  const field = (await page.locator("svg.field-diagram").boundingBox())!;
  await page.touchscreen.tap(
    field.x + field.width / 2,
    field.y + field.height / 3,
  );
  await expect(page.locator("[data-scene-label]")).toHaveCount(1);
  await expect(sheet).toHaveAttribute("data-sheet", "full");
  const text = sheet.getByRole("textbox", { name: "Label text" });
  await expect(text).toBeFocused();
  await expect(text).toHaveValue("5 Yds");
  // The sheet rose under the finger, and the tap that placed the note did
  // not go on to pick a meaning there.
  await expect(sheet.locator(".button-grid .active")).toHaveCount(0);
  await text.fill("MAX SPLIT");
  await expect(page.locator("svg.field-diagram")).toContainText("MAX SPLIT");

  // Back to the field, then the note tapped: the sheet opens on it again.
  await page.getByRole("button", { name: "Show the field" }).tap();
  await expect(sheet).toHaveAttribute("data-sheet", "peek");
  const note = (await page.locator("[data-scene-label]").boundingBox())!;
  await page.touchscreen.tap(note.x + note.width / 2, note.y + note.height / 2);
  await expect(sheet).toHaveAttribute("data-sheet", "full");
  await expect(text).toHaveValue("MAX SPLIT");
  await text.fill("CRACK");
  await expect(page.locator("svg.field-diagram")).toContainText("CRACK");

  await sheet.screenshot({
    path: testInfo.outputPath("phone-text-inspector.png"),
  });
});
