import { type Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { addDefense, savedPlay } from "./defense-helpers";

/**
 * On a phone, a picked defender is offered his own position's calls: the
 * quick tray gives the Mike a backer's hook, curl/flat, man, spy and gaps,
 * not the safeties' deep zones beside them. The rest of the defense's calls
 * are folded under Other assignments in his sheet, where a deep third is
 * still his to be given. His sheet with the fold open is the run's artifact.
 */
test.use({ viewport: { width: 390, height: 844 } });

/** Where a man's stance is drawn, in client pixels. */
async function stance(page: Page, id: string) {
  return page.locator(`[data-scene-player="${id}"]`).evaluate((node) => {
    const matrix = (node as SVGGraphicsElement).getScreenCTM()!;
    const at = new DOMPoint(0, 0).matrixTransform(matrix);
    return { x: at.x, y: at.y };
  });
}

const MIKE = [
  "Hook",
  "Curl / flat",
  "Man",
  "QB spy",
  "A gap",
  "B gap",
  "C gap",
  "D gap",
];
const OTHERS = ["Deep 1/3", "Deep 1/2", "Middle 1/3", "Robber", "Deep 1/4"];

test("gives a picked Mike a Mike's calls, and folds the rest in his sheet", async ({
  page,
}, info) => {
  await page.goto("/");
  await addDefense(page);
  const play = await savedPlay(page);
  const mike = play.players.find(
    (man) => man.unit === "defense" && man.label === "M",
  )!;
  expect(mike).toBeDefined();

  const at = await stance(page, mike.id);
  await page.touchscreen.tap(at.x, at.y);
  await expect(page.locator(`[data-scene-player="${mike.id}"]`)).toHaveClass(
    /selected/,
  );

  // The tray above the tools is his own calls and nothing else.
  const tray = page.getByRole("navigation", { name: "Quick calls" });
  await expect(tray).toContainText("M · Assignments");
  await expect(tray.getByRole("button")).toHaveText(MIKE);

  // His sheet says the same, with the other positions' calls folded under it.
  await page
    .getByRole("button", { name: "Show all assignments", exact: true })
    .tap();
  const sheet = page.locator('[data-sheet="full"]');
  await expect(
    sheet
      .locator(".section-heading", { hasText: "Quick assignments" })
      .locator("xpath=following-sibling::div[1]")
      .getByRole("button"),
  ).toHaveText(MIKE);
  const fold = sheet.locator('[data-disclosure="player-other-assignments"]');
  const toggle = fold.getByRole("button", { name: "Other assignments" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(fold.locator(".button-grid")).toHaveCount(0);

  await toggle.tap();
  await expect(fold.locator(".button-grid").getByRole("button")).toHaveText(
    OTHERS,
  );
  await fold.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("phone-mike-other-assignments.png"),
  });
});
