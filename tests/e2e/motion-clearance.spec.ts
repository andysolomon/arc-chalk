import { type Page } from "@playwright/test";
import { expect, openSeededEditor, test } from "./fixtures";

/**
 * Pre-snap motion goes round the men in its way. Against the seeded Stick —
 * Thunder offense with Nickel Cover 1 on, Z comes in motion flat across the
 * formation, a line drawn straight through the tight end and the interior
 * line. His Thunder route still starts where he lined up, so just before
 * the snap he runs back to it. Scrubbed from the first frame to the snap,
 * nobody is ever drawn on top of anybody: Z goes behind the men in his way,
 * there and back, and the corner walking across with him in man goes round
 * the defenders in his. The field where the motion ends, trails and all, is
 * the run's artifact.
 */

test.use({ viewport: { width: 1440, height: 960 } });

/** Player symbols are 13 frame units in radius: two touch at 26. */
const TOUCHING = 26;

const field = (page: Page) => page.locator("svg.field-diagram").first();

async function clickField(
  page: Page,
  point: { readonly x: number; readonly y: number },
): Promise<void> {
  const element = field(page);
  const box = await element.boundingBox();
  if (!box) throw new Error("The field is not on screen.");
  const [viewX, viewY, viewWidth, viewHeight] = (
    (await element.getAttribute("viewBox")) ?? "0 0 1000 620"
  )
    .split(" ")
    .map(Number) as [number, number, number, number];
  await page.mouse.click(
    box.x + ((point.x - viewX) / viewWidth) * box.width,
    box.y + ((point.y - viewY) / viewHeight) * box.height,
  );
}

/** Every man on the field and where he is drawn, in frame units. */
async function everyone(
  page: Page,
): Promise<{ name: string; x: number; y: number }[]> {
  return page.locator("[data-scene-player]").evaluateAll((men) =>
    men.map((man) => {
      const [, x, y] =
        /translate\(([-\d.]+)[ ,]+([-\d.]+)/.exec(
          man.getAttribute("transform") ?? "",
        ) ?? [];
      return {
        name: `${man.getAttribute("aria-label")} (${man.getAttribute("data-scene-player")})`,
        x: Number(x),
        y: Number(y),
      };
    }),
  );
}

/** Every pair of men drawn on top of each other. */
function overlapping(men: { name: string; x: number; y: number }[]): string[] {
  const found: string[] = [];
  for (const [index, one] of men.entries()) {
    for (const other of men.slice(index + 1)) {
      const apart = Math.hypot(one.x - other.x, one.y - other.y);
      if (apart < TOUCHING) {
        found.push(`${one.name} and ${other.name} ${apart.toFixed(1)} apart`);
      }
    }
  }
  return found;
}

test("motion goes round the men in its way, on both sides of the ball", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await page.keyboard.press("Control+Shift+d");
  const browser = page.getByRole("dialog", { name: "Defenses" });
  const toggle = browser.getByRole("button", { name: "With assignments" });
  if ((await toggle.getAttribute("aria-pressed")) !== "true") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await browser
    .getByRole("textbox", { name: "Search defenses" })
    .fill("Nickel Cover 1");
  await browser.getByText("Nickel Cover 1", { exact: true }).click();
  await expect(browser).toBeHidden();
  await expect(page.locator("[data-scene-player]")).toHaveCount(22);
  await expect(
    page.locator('[data-scene-path-group][aria-label$=" man on Z"]'),
  ).toHaveCount(1);
  expect(overlapping(await everyone(page))).toEqual([]);

  // Z, split wide right, in motion flat across to the other slot: the line
  // runs straight through Y and the line.
  await page.keyboard.press("Escape");
  await clickField(page, { x: 886, y: 452 });
  await expect(page.locator(".player-heading")).toBeVisible();
  await page
    .getByRole("complementary", { name: "Play inspector" })
    .getByRole("button", { name: /^Motion/ })
    .click();
  await clickField(page, { x: 380, y: 452 });
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");

  const slider = page
    .getByLabel("Playback controls")
    .getByRole("slider", { name: "Scrub the play" });
  await slider.focus();
  await page.keyboard.press("Home");
  const start = Number(await slider.getAttribute("aria-valuemin"));
  expect(start).toBeLessThan(-1000);
  const z = page.locator('[aria-label="Z offense player"]');
  const xOf = async () =>
    Number(
      /translate\(([-\d.]+)/.exec(
        (await z.getAttribute("transform")) ?? "",
      )?.[1],
    );

  const problems: string[] = [];
  let furthest = { atMs: start, x: await xOf() };
  for (let atMs = start; atMs <= 0; atMs += 100) {
    await expect(slider).toHaveAttribute("aria-valuenow", String(atMs));
    problems.push(
      ...overlapping(await everyone(page)).map(
        (pair) => `${(atMs / 1000).toFixed(1)}s: ${pair}`,
      ),
    );
    const x = await xOf();
    if (x < furthest.x) furthest = { atMs, x };
    await page.keyboard.press("ArrowRight");
  }
  expect(problems).toEqual([]);

  // He did go in motion, all the way to where it was drawn to — within the
  // ground he covers between two frames, as he turns straight back for his
  // route.
  const drawn = (
    (await page
      .locator('[data-scene-path-group][aria-label="Z motion"] path')
      .first()
      .getAttribute("d")) ?? ""
  )
    .match(/-?\d+(?:\.\d+)?/g)!
    .map(Number);
  expect(Math.abs(furthest.x - drawn.at(-2)!)).toBeLessThan(15);

  await page.keyboard.press("Home");
  for (let atMs = start; atMs < furthest.atMs; atMs += 100) {
    await page.keyboard.press("ArrowRight");
  }
  await expect(slider).toHaveAttribute("aria-valuenow", String(furthest.atMs));
  await field(page).screenshot({
    path: testInfo.outputPath("motion-round-the-formation.png"),
  });
});
