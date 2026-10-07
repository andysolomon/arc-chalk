import type { Page } from "@playwright/test";

import {
  chooseWorkspaceView,
  expect,
  openSeededEditor,
  test,
} from "./fixtures";

/**
 * On a phone the Playbooks pages scroll the document, not a box inside a
 * pinned shell: a phone browser folds its address bar away only when the
 * document scrolls. The header stays pinned, the Plays list is still
 * virtualized against the window, and the editor keeps its fixed shell so
 * the field takes the drag.
 */
const VIEWPORT = { width: 390, height: 844 };
/** Enough plays that the list is longer than it mounts. */
const EXTRA_PLAYS = 16;

test.use({
  viewport: VIEWPORT,
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
});

const documentScroll = (page: Page) =>
  page.evaluate(() => ({
    top: Math.round(globalThis.scrollY),
    height: document.documentElement.scrollHeight,
    viewport: document.documentElement.clientHeight,
  }));

const toBottom = async (page: Page) => {
  await page.evaluate(() =>
    globalThis.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expect
    .poll(async () => {
      const { top, height, viewport } = await documentScroll(page);
      return top + viewport >= height - 1;
    })
    .toBe(true);
};

test("scrolls the Playbooks page, not a box inside it, under a pinned header", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await openSeededEditor(page);

  // The editor keeps its shell: nothing to scroll, so the field takes the drag.
  let scroll = await documentScroll(page);
  expect(scroll.height).toBeLessThanOrEqual(scroll.viewport);

  for (let index = 0; index < EXTRA_PLAYS; index += 1) {
    await chooseWorkspaceView(page, "Playbooks");
    await page.locator(".destination-new").tap();
    await page
      .getByRole("group", { name: "New play" })
      .getByRole("button", { name: "New offensive play" })
      .tap();
    await expect(page.locator(".view-playbooks")).toHaveCount(0);
  }

  await chooseWorkspaceView(page, "Playbooks");
  const list = page.locator(".playbook-scroll");
  await expect(list).toHaveAttribute("data-layout", "list");
  const total = Number(await list.getAttribute("data-virtual-count"));
  expect(total).toBeGreaterThanOrEqual(8 + EXTRA_PLAYS);

  // The page is what scrolls; the list is laid out whole within it.
  scroll = await documentScroll(page);
  expect(scroll.top).toBe(0);
  expect(scroll.height).toBeGreaterThan(scroll.viewport);
  const own = await list.evaluate((node) => ({
    client: node.clientHeight,
    scroll: node.scrollHeight,
  }));
  expect(own.scroll).toBeLessThanOrEqual(own.client + 1);

  // Still virtualized: fewer rows mounted than the list holds.
  const rows = page.locator(".playbook-virtual-row");
  expect(await rows.count()).toBeLessThan(total);

  await toBottom(page);
  const header = page.locator("header.topbar.phone-topbar");
  const headerBox = (await header.boundingBox())!;
  expect(Math.round(headerBox.y)).toBe(0);

  // The last row is mounted, on screen, and clear of the header.
  const last = page.locator(`.playbook-virtual-row[data-index="${total - 1}"]`);
  await expect(last).toBeVisible();
  const lastBox = (await last.boundingBox())!;
  expect(lastBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(VIEWPORT.height + 1);
  expect(await rows.count()).toBeLessThan(total);

  // Rows sit one after another down the page, none over another.
  const tops = await rows.evaluateAll((nodes) =>
    nodes
      .map((node) => node.getBoundingClientRect())
      .sort((a, b) => a.top - b.top)
      .map(({ top, height }) => ({ top, height })),
  );
  for (let index = 1; index < tops.length; index += 1) {
    const above = tops[index - 1]!;
    expect(Math.round(tops[index]!.top)).toBe(
      Math.round(above.top + above.height),
    );
  }

  await page.screenshot({
    path: testInfo.outputPath("phone-plays-scrolled.png"),
  });

  // Another page opens at its top, and so does the editor.
  await page
    .getByRole("navigation", { name: "Playbooks pages" })
    .getByRole("button", { name: "Formations", exact: true })
    .tap();
  await expect(page.getByRole("region", { name: "Formations" })).toBeVisible();
  await expect.poll(async () => (await documentScroll(page)).top).toBe(0);
  scroll = await documentScroll(page);
  expect(scroll.height).toBeGreaterThan(scroll.viewport);
  await toBottom(page);
  expect(Math.round((await header.boundingBox())!.y)).toBe(0);

  await chooseWorkspaceView(page, "Editor");
  await expect.poll(async () => (await documentScroll(page)).top).toBe(0);
  scroll = await documentScroll(page);
  expect(scroll.height).toBeLessThanOrEqual(scroll.viewport);
});
