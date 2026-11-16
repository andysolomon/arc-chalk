import type { PlayDocument } from "@chalk/domain";
import type { Locator, Page } from "@playwright/test";
import { closePlayName, expect, playNameField } from "./fixtures";
/**
 * The button for one of the picked defender's calls: among his Quick
 * assignments when his position plays it, and otherwise under Other
 * assignments, which is unfolded to reach it.
 */
export async function assignmentButton(
  page: Page,
  name: string,
): Promise<Locator> {
  const heading = page.locator(".section-heading", {
    hasText: "Quick assignments",
  });
  await expect(heading).toBeVisible();
  const own = heading
    .locator("xpath=following-sibling::div[1]")
    .getByRole("button", { name, exact: true });
  if ((await own.count()) > 0) return own;
  const fold = page.locator('[data-disclosure="player-other-assignments"]');
  const toggle = fold.getByRole("button", { name: "Other assignments" });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  return fold
    .locator(".button-grid")
    .getByRole("button", { name, exact: true });
}

export async function selectPlayers(page: Page, ids: readonly string[]) {
  await page.keyboard.press("Escape");
  for (const [index, id] of ids.entries()) {
    const point = await page
      .locator(`[data-scene-player="${id}"]`)
      .evaluate((node) => {
        const matrix = (node as SVGGraphicsElement).getScreenCTM()!;
        const at = new DOMPoint(0, 0).matrixTransform(matrix);
        return { x: at.x, y: at.y };
      });
    if (index) await page.keyboard.down("Shift");
    await page.mouse.click(point.x, point.y);
    if (index) await page.keyboard.up("Shift");
  }
}

export async function savedPlay(page: Page): Promise<PlayDocument> {
  // A phone keeps the name in its drawer; put the drawer back as it was.
  const drawerWasOpen = await page
    .getByRole("navigation", { name: "Sidebar" })
    .getByRole("button", { name: "Close the sidebar" })
    .isVisible();
  const name = await (await playNameField(page)).inputValue();
  if (!drawerWasOpen) await closePlayName(page);
  return page.evaluate(
    (name) =>
      new Promise<PlayDocument>((resolve, reject) => {
        const open = indexedDB.open("chalk-production-beta");
        open.onerror = () =>
          reject(open.error ?? new Error("Could not open play database"));
        open.onsuccess = () => {
          const db = open.result;
          const read = db
            .transaction("plays", "readonly")
            .objectStore("plays")
            .getAll();
          read.onerror = () => {
            db.close();
            reject(read.error ?? new Error("Could not read play database"));
          };
          read.onsuccess = () => {
            db.close();
            const rows = read.result as Array<{ document: PlayDocument }>;
            const row = rows.find(
              (row: { document: PlayDocument }) => row.document.name === name,
            );
            if (row) resolve(row.document);
            else reject(new Error("Play not saved"));
          };
        };
      }),
    name,
  );
}

export async function addDefense(page: Page) {
  await expect(page.locator("[data-scene-player]").first()).toBeVisible();
  await page.keyboard.press("Control+Shift+d");
  const browser = page.getByRole("dialog", { name: "Defenses", exact: true });
  const assignments = browser.getByRole("button", { name: "With assignments" });
  if ((await assignments.getAttribute("aria-pressed")) !== "true")
    await assignments.click();
  await browser
    .getByRole("textbox", { name: "Search defenses" })
    .fill("4-3 Cover 3");
  await browser.getByText("4-3 Cover 3", { exact: true }).click();
  await expect(browser).toBeHidden();
  await expect(
    page.locator('[data-scene-player][aria-label$="defense player"]'),
  ).toHaveCount(11);
}
export async function openDefense(page: Page) {
  await page
    .getByRole("button", { name: "Defensive adjustments", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Defensive adjustments",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}
