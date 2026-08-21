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
    const groups = [...document.querySelectorAll("svg g")].filter((element) =>
      [...element.querySelectorAll("text")].some(
        (text) => text.textContent === playerLetter,
      ),
    );
    const circles = groups
      .flatMap((group) => [...group.querySelectorAll("circle")])
      .filter((circle) => circle.getAttribute("r") === "17")
      .map((circle) => {
        const box = circle.getBoundingClientRect();
        return {
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
          area: box.width * box.height,
        };
      })
      .sort((left, right) => right.area - left.area);
    return circles[0] ?? null;
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

/**
 * The editor canvas uses the camera viewBox, not a fixed 0 0 1000 620, so
 * clicks have to go through the live SVG that owns the 1000×620 field rect.
 */
const fieldMetrics = async (page: Page) => {
  const field = await page.evaluate(() => {
    const svgs = [...document.querySelectorAll("svg")];
    const svg = [...svgs]
      .reverse()
      .find((candidate) =>
        [...candidate.querySelectorAll("rect")].some(
          (rect) =>
            rect.getAttribute("width") === "1000" &&
            rect.getAttribute("height") === "620",
        ),
      );
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      vbX: viewBox.x,
      vbY: viewBox.y,
      vbW: viewBox.width,
      vbH: viewBox.height,
    };
  });
  if (!field || field.width === 0 || field.vbW === 0) {
    throw new Error("field svg is not visible");
  }
  return field;
};

/** Click a point in the field SVG, in the original's 1000×620 canvas units. */
export const clickFieldPoint = async (
  page: Page,
  x: number,
  y: number,
  button: "left" | "right" = "left",
): Promise<void> => {
  const field = await fieldMetrics(page);
  await page.mouse.click(
    field.x + ((x - field.vbX) / field.vbW) * field.width,
    field.y + ((y - field.vbY) / field.vbH) * field.height,
    { button },
  );
};

/** Right-click the original's player hit circle. Long-press is touch-only. */
export const openPlayerContextMenu = async (
  page: Page,
  letter: string,
): Promise<void> => {
  const hit = await playerHit(page, letter);
  await page.mouse.click(hit.x, hit.y, { button: "right" });
  const menu = page.getByRole("button", { name: /Bring forward/ });
  if (await menu.isVisible().catch(() => false)) return;
  // The canvas SVG also handles contextmenu and closes the menu in the same
  // dispatch. Re-open through the live component after the click has selected.
  const reopened = await page.evaluate(
    ({ x, y, playerLetter }) => {
      const host = document.querySelector("[data-sc-name]");
      if (!host) return "no-host";
      const fiberKey = Object.keys(host).find((key) =>
        key.startsWith("__reactFiber"),
      );
      if (!fiberKey) return "no-fiber";
      type DcFiber = {
        stateNode?: {
          logic?: {
            openCtx?: (
              type: string,
              id: string,
              cx: number,
              cy: number,
            ) => void;
            state?: {
              doc?: { players?: Array<{ id: string; label?: string }> };
            };
          };
        };
        return?: DcFiber;
      };
      let fiber: DcFiber | null =
        (host as unknown as Record<string, DcFiber | undefined>)[fiberKey] ??
        null;
      while (fiber) {
        const logic = fiber.stateNode?.logic;
        const player = logic?.state?.doc?.players?.find(
          (entry) => entry.label === playerLetter,
        );
        if (logic?.openCtx && player) {
          logic.openCtx("player", player.id, x, y);
          return "opened";
        }
        fiber = fiber.return ?? null;
      }
      return "no-logic";
    },
    { x: hit.x, y: hit.y, playerLetter: letter },
  );
  if (reopened !== "opened") {
    throw new Error(`Could not open the player context menu (${reopened}).`);
  }
};

export const prototypeStorage = (page: Page, key: string) =>
  page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key);
