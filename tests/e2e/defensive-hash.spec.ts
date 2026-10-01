import { type Locator, type Page, type TestInfo } from "@playwright/test";
import { expect, startNewPlay, test } from "./fixtures";

/**
 * Issue #159: the ball spotted on a hash for a defensive Play. A defense
 * drawn alone lines up on the ball, so once the official spots it on the
 * right hash the whole front goes with it, the sidebar says so, the call is
 * still the call, and the printed footer agrees — through undo, redo and a
 * reload, and on to the left hash. One man moved by hand makes it a custom
 * front that still names the call it came from. The sheet as printed on the
 * right hash and the field after that move are the run's artifacts.
 */
test.use({ viewport: { width: 1440, height: 960 } });

const sidebar = (page: Page) =>
  page.getByRole("navigation", { name: "Sidebar" });
const ballOnRow = (page: Page) =>
  sidebar(page).getByRole("button", { name: /^Ball on/ });
const callRow = (page: Page) =>
  sidebar(page).getByRole("button", { name: /^Defensive call/ });

/** One of the three spots' buttons, opening the Ball on row when it is folded. */
async function spotButton(
  page: Page,
  name: "Middle" | "L hash" | "R hash",
): Promise<Locator> {
  const button = sidebar(page).getByRole("button", { name, exact: true });
  if (!(await button.isVisible())) await ballOnRow(page).click();
  await expect(button).toBeVisible();
  return button;
}

const defender = (page: Page, label: string) =>
  page.locator(`[aria-label="${label} defense player"]`);

/** Where a man stands across the field, in the frame the field is drawn in. */
async function xOf(man: Locator): Promise<number> {
  const [, x] =
    /translate\(([-\d.]+)[ ,]+([-\d.]+)/.exec(
      (await man.getAttribute("transform")) ?? "",
    ) ?? [];
  return Number(x);
}

/** The four men on the front, left to right. */
async function frontOf(page: Page): Promise<number[]> {
  const men = [
    ...(await defender(page, "E").all()),
    ...(await defender(page, "T").all()),
  ];
  return (await Promise.all(men.map(xOf))).sort((left, right) => left - right);
}

/** Opens the current Play's install page in the print preview. */
async function installPreview(page: Page) {
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Print & export", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Print preview", exact: true })
    .click();
  const output = page.getByRole("region", { name: "Print & export" });
  await output.getByRole("button", { name: /^Install page/ }).click();
  return page.frameLocator('iframe[title="Preview"]');
}

/** The sheet as printed, saved beside the run's results at a fixed width. */
async function saveSheet(
  page: Page,
  preview: ReturnType<Page["frameLocator"]>,
  info: TestInfo,
  name: string,
) {
  const html = await preview
    .locator("html")
    .evaluate((root) => `<!doctype html>${root.outerHTML}`);
  const sheet = await page.context().newPage();
  await sheet.setViewportSize({ width: 816, height: 1056 });
  await sheet.setContent(html);
  await sheet.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: true,
  });
  await sheet.close();
}

/** A hash is eight and a bit yards off the middle: well over a hundred frame units. */
const A_HASH_AWAY = 150;

test("spots the ball on a hash and takes the defense with it, call and all", async ({
  page,
}, testInfo) => {
  // Two page loads and a printed sheet: longer than one gesture's allowance.
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible({ timeout: 30_000 });
  await startNewPlay(page, "defensive");
  await expect(page.locator("[data-scene-player]")).toHaveCount(0);
  const playName = page.getByRole("textbox", { name: "Play name" });
  await playName.fill("Cover 3 on the hash");
  await playName.press("Enter");

  await page.keyboard.press("Control+Shift+d");
  const browser = page.getByRole("dialog", { name: "Defenses" });
  await expect(browser).toBeVisible();
  const withLines = browser.getByRole("button", { name: "With assignments" });
  if ((await withLines.getAttribute("aria-pressed")) !== "true") {
    await withLines.click();
  }
  await browser
    .getByRole("textbox", { name: "Search defenses" })
    .fill("4-3 Cover 3");
  await browser.getByText("4-3 Cover 3", { exact: true }).click();
  await expect(browser).toBeHidden();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await expect(callRow(page)).toHaveAccessibleName(
    "Defensive call, 4-3 Cover 3",
  );
  await expect(ballOnRow(page)).toHaveAccessibleName("Ball on, Middle");

  const mike = defender(page, "M");
  const inTheMiddle = await xOf(mike);
  const frontInTheMiddle = await frontOf(page);

  // The right hash: the row, the undo entry and the men all say so.
  const rightHash = await spotButton(page, "R hash");
  await rightHash.click();
  await expect(rightHash).toHaveAttribute("aria-pressed", "true");
  await expect(rightHash).toBeDisabled();
  await expect(ballOnRow(page)).toHaveAccessibleName("Ball on, R hash");
  // The banner's history controls, not the toast's own Undo.
  const banner = page.getByRole("banner");
  const undo = banner.getByRole("button", { name: "Undo" });
  await expect(undo).toHaveAttribute("title", "Undo Ball on the right hash");
  await expect.poll(() => xOf(mike)).toBeGreaterThan(inTheMiddle + A_HASH_AWAY);
  const onTheRight = await xOf(mike);
  const frontOnTheRight = await frontOf(page);
  for (const [index, x] of frontOnTheRight.entries()) {
    expect(x).toBeGreaterThan(frontInTheMiddle[index]!);
  }
  // The boundary corner had to come in, and it is still the same call.
  await expect(page.getByRole("status")).toContainText("tightened");
  await expect(callRow(page)).toHaveAccessibleName(
    "Defensive call, 4-3 Cover 3",
  );

  // Undo puts it back in the middle; redo spots it again.
  await undo.click();
  await expect(ballOnRow(page)).toHaveAccessibleName("Ball on, Middle");
  await expect.poll(() => xOf(mike)).toBeCloseTo(inTheMiddle, 1);
  const redo = banner.getByRole("button", { name: "Redo" });
  await expect(redo).toHaveAttribute("title", "Redo Ball on the right hash");
  await redo.click();
  await expect(ballOnRow(page)).toHaveAccessibleName("Ball on, R hash");
  await expect.poll(() => xOf(mike)).toBeCloseTo(onTheRight, 1);
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();

  // A reload reads the hash and the call back off the men as saved.
  await page.reload();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11, {
    timeout: 30_000,
  });
  await expect(playName).toHaveValue("Cover 3 on the hash");
  await expect(ballOnRow(page)).toHaveAccessibleName("Ball on, R hash");
  await expect(callRow(page)).toHaveAccessibleName(
    "Defensive call, 4-3 Cover 3",
  );
  expect(await xOf(defender(page, "M"))).toBeCloseTo(onTheRight, 1);

  // The install page prints the call on the right hash.
  const preview = await installPreview(page);
  await expect(preview.locator(".mt span")).toHaveText([
    "Base",
    "4-3 Cover 3",
    "right hash",
  ]);
  await saveSheet(page, preview, testInfo, "install-right-hash");
  // Print & export is a workspace view; the banner leads back to the editor.
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Editor" })
    .click();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);

  // Across to the left hash: the men over the ball go with it.
  const leftHash = await spotButton(page, "L hash");
  await leftHash.click();
  await expect(ballOnRow(page)).toHaveAccessibleName("Ball on, L hash");
  await expect
    .poll(() => xOf(defender(page, "M")))
    .toBeLessThan(inTheMiddle - A_HASH_AWAY);
  await expect(callRow(page)).toHaveAccessibleName(
    "Defensive call, 4-3 Cover 3",
  );

  // One man moved by hand: a custom front that still names its call.
  const box = await defender(page, "M").boundingBox();
  expect(box).toBeTruthy();
  const from = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y, { steps: 4 });
  await page.mouse.move(from.x + 60, from.y, { steps: 4 });
  await page.mouse.up();
  await expect(callRow(page)).toHaveAccessibleName(
    "Defensive call, Custom · from 4-3 Cover 3",
  );
  await expect(ballOnRow(page)).toHaveAccessibleName("Ball on, L hash");

  await page
    .locator("svg.field-diagram")
    .first()
    .screenshot({ path: testInfo.outputPath("defense-on-the-left-hash.png") });
});
