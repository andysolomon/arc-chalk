import { writeFile } from "node:fs/promises";

import type { Page, TestInfo } from "@playwright/test";

/**
 * What a scratch journey imports. The repo's own fixtures come through
 * unchanged, so a journey opens the editor and finds controls the way the
 * specs in tests/e2e do.
 */
export * from "../../../../tests/e2e/fixtures";

const counters = new WeakMap<TestInfo, number>();

/**
 * Saves what the page shows now as numbered evidence: a screenshot and the
 * ARIA tree a screen reader would get. Call it after each action that
 * matters, so the run shows the state each action left, in order.
 */
export async function capture(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const count = (counters.get(testInfo) ?? 0) + 1;
  counters.set(testInfo, count);
  const stem = `${String(count).padStart(2, "0")}-${name}`;
  const shot = testInfo.outputPath(`${stem}.png`);
  const tree = testInfo.outputPath(`${stem}.aria.yml`);
  await page.screenshot({ path: shot });
  await writeFile(tree, await page.locator("body").ariaSnapshot());
}
