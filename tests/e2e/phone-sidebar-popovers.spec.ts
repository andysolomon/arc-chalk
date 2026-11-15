import { expect, openSeededEditor, test } from "./fixtures";

/**
 * On a phone a sidebar row's control is a page of the drawer, and the
 * drawer's head names it. What a desktop popover keeps beside its title —
 * the Library's + Variation, Ball on's ? — stands in that head beside the
 * page's name, not alone on a line of its own; and what the ? says opens
 * under the head and pushes the control down rather than covering it. The
 * test ends on a screenshot of the drawer at a fixed 390×844.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("a drawer page carries its action and ? in the head beside its name", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await page.getByRole("button", { name: "Open the sidebar" }).tap();
  const drawer = page.getByRole("navigation", { name: "Sidebar" });
  const head = drawer.locator(".sidebar-drawer-head");
  const fold = drawer.getByRole("button", { name: "View & library" });
  if ((await fold.getAttribute("aria-expanded")) !== "true") await fold.tap();

  await drawer.locator('[data-row="library"] > button.sidebar-row').tap();
  await expect(head.locator(".sidebar-page-title")).toHaveText("Library");
  const variation = head.getByRole("button", { name: "+ Variation" });
  await expect(variation).toBeVisible();
  // Same line as the page's name, and a thumb's height.
  const title = (await head.locator(".sidebar-page-title").boundingBox())!;
  const action = (await variation.boundingBox())!;
  expect(
    Math.abs(action.y + action.height / 2 - (title.y + title.height / 2)),
  ).toBeLessThan(4);
  expect(action.height).toBeGreaterThanOrEqual(44);
  await drawer.getByRole("button", { name: "Back" }).tap();

  await drawer.locator('[data-row="ball"] > button.sidebar-row').tap();
  await expect(head.locator(".sidebar-page-title")).toHaveText("Ball on");
  const ask = head.getByRole("button", { name: "About the formation" });
  await expect(ask).toBeVisible();
  const closeBefore = (await head
    .getByRole("button", { name: "Close the sidebar" })
    .boundingBox())!;
  await ask.tap();
  const words = drawer.locator(".hint-body");
  await expect(words).toBeVisible();
  const said = (await words.boundingBox())!;
  const middle = (await drawer
    .getByRole("button", { name: "Middle", exact: true })
    .boundingBox())!;
  // The words sit above the hashes and clear of them, and the head's own
  // line does not move.
  expect(said.y + said.height).toBeLessThanOrEqual(middle.y);
  const closeAfter = (await head
    .getByRole("button", { name: "Close the sidebar" })
    .boundingBox())!;
  expect(closeAfter.y).toBe(closeBefore.y);

  await page.screenshot({
    path: testInfo.outputPath("phone-drawer-ball-on.png"),
  });
});
