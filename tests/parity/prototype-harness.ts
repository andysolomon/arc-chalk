import { expect, type Page } from "@playwright/test";

export const screenshotTolerance = (localMaxDiffPixels = 0) =>
  process.env.CI
    ? // Chromium text rasterization differs slightly between macOS captures and
      // GitHub's Linux runners. Keep local baselines strict while allowing only
      // the observed cross-platform antialiasing delta in CI.
      { maxDiffPixelRatio: 0.02 }
    : { maxDiffPixels: localMaxDiffPixels };

export const loadCanonicalPrototype = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });

  await page.goto("/Chalk%20Play%20Editor.dc.html");
  await expect(page).toHaveTitle("Stick — Thunder — Chalk", {
    timeout: 30_000,
  });
  await expect(page.locator('input[value="Stick — Thunder"]')).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
};

const captureOptions = (localMaxDiffPixels = 0) => ({
  animations: "disabled" as const,
  caret: "hide" as const,
  fullPage: true,
  ...screenshotTolerance(localMaxDiffPixels),
});

export const captureNamedGolden = async (
  page: Page,
  name: string,
  localMaxDiffPixels = 0,
): Promise<void> => {
  await expect(page).toHaveScreenshot(name, captureOptions(localMaxDiffPixels));
};

const playerHit = async (page: Page, letter: string) => {
  const hit = await page.evaluate((playerLetter) => {
    const groups = [...document.querySelectorAll("svg g")];
    const group = groups.find((element) =>
      [...element.querySelectorAll("text")].some(
        (text) => text.textContent === playerLetter,
      ),
    );
    const circle = group
      ? [...group.querySelectorAll("circle")].at(-1)
      : undefined;
    if (!circle) return null;
    const box = circle.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, letter);
  if (!hit) throw new Error(`Player ${letter} is not on the field.`);
  return hit;
};

/**
 * Clicks the original's invisible hit circle for a lettered Player. Letter
 * glyphs have pointer-events: none, so the text itself is not a target.
 */
export const clickPlayerByLetter = async (
  page: Page,
  letter: string,
  button: "left" | "right" = "left",
): Promise<void> => {
  const hit = await playerHit(page, letter);
  await page.mouse.click(hit.x, hit.y, { button });
};

/** Click a point in the 1000×620 field SVG, in viewBox units. */
export const clickFieldPoint = async (
  page: Page,
  x: number,
  y: number,
  button: "left" | "right" = "left",
): Promise<void> => {
  const boxes = await page
    .locator('svg[viewBox="0 0 1000 620"]')
    .evaluateAll((svgs) =>
      svgs.map((svg) => {
        const box = svg.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      }),
    );
  const field = boxes.reduce<
    { x: number; y: number; width: number; height: number } | undefined
  >(
    (largest, box) =>
      !largest || box.width * box.height > largest.width * largest.height
        ? box
        : largest,
    undefined,
  );
  if (!field || field.width === 0) {
    throw new Error("field svg is not visible");
  }
  await page.mouse.click(
    field.x + (x / 1000) * field.width,
    field.y + (y / 620) * field.height,
    { button },
  );
};

export const prototypeStorage = (page: Page, key: string) =>
  page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key);
