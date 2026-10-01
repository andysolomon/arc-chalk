import { expect, openSeededEditor, test } from "./fixtures";

/**
 * ADR 0074 on a phone. The header sheds New play, Present, Help and Print &
 * export (ADR 0057), so each of them still needs exactly one home: More
 * carries New play and Present, and the drawer's foot carries Print &
 * export, Settings and Help as icons. The Playbooks pages have no drawer,
 * so their header carries Help and Settings where More stood. The test ends
 * on a screenshot of the drawer at a fixed 390×844.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("a phone reaches each control from one place", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await expect(page.locator("header.topbar.phone-topbar")).toBeVisible();
  const banner = page.getByRole("banner");

  // More carries what the phone header has no room for, and nothing that
  // lives elsewhere.
  await banner.getByRole("button", { name: "More actions" }).tap();
  const more = page.locator(".more-panel");
  for (const name of [
    /^New offensive play/,
    /^New defensive play/,
    /^Present/,
  ]) {
    await expect(more.getByRole("button", { name })).toBeVisible();
  }
  for (const name of [/^Settings/, /^Account/, /^Game plans/, /^Backup/]) {
    await expect(more.getByRole("button", { name })).toHaveCount(0);
  }
  await banner.getByRole("button", { name: "More actions" }).tap();

  // The drawer's foot: Print & export, Settings and Help, as icons.
  await banner.getByRole("button", { name: "Open the sidebar" }).tap();
  const drawer = page.getByRole("navigation", { name: "Sidebar" });
  const foot = drawer.locator(".sidebar-foot");
  for (const name of ["Print & export", "Settings", "Help"]) {
    const icon = foot.getByRole("button", { name, exact: true });
    await expect(icon).toBeVisible();
    await expect(icon).toHaveText("");
    expect((await icon.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(
    drawer.getByRole("button", { name: "View & library" }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("phone-drawer.png") });

  // Help is a page inside the drawer, and Back returns to the rows.
  await foot.getByRole("button", { name: "Help", exact: true }).tap();
  const help = drawer.getByRole("group", { name: "Help" });
  await expect(
    help.getByRole("button", { name: "Demo — guided tour", exact: true }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: /Back/ }).tap();
  await expect(foot).toBeVisible();
  await drawer.getByRole("button", { name: "Close the sidebar" }).tap();

  // The Playbooks page has no drawer: Help and Settings stand where More
  // stood, and the ≡ that would open nothing is gone.
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Playbooks", exact: true })
    .tap();
  await expect(
    banner.getByRole("button", { name: "Open the sidebar" }),
  ).toHaveCount(0);
  await expect(
    banner.getByRole("button", { name: "More actions" }),
  ).toHaveCount(0);
  await banner.getByRole("button", { name: "Settings", exact: true }).tap();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
});

/**
 * A phone held sideways has about 330 px under its header — less than Help
 * or a phone's More needs. Each menu scrolls inside itself, so its last
 * entry is reachable and never drawn past the bottom of the glass.
 */
test.describe("held sideways", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test("keeps every header menu's last entry on the glass", async ({
    page,
  }, testInfo) => {
    await openSeededEditor(page);
    const banner = page.getByRole("banner");
    const onGlass = async (selector: string) => {
      const box = (await page.locator(selector).boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(390);
    };

    // More: Share & assets is its last entry, and it unfolds in place.
    await banner.getByRole("button", { name: "More actions" }).tap();
    await onGlass(".more-panel");
    const share = page.getByRole("button", { name: "Share & assets" });
    await share.scrollIntoViewIfNeeded();
    await expect(share).toBeInViewport();
    await share.tap();
    await expect(page.locator(".share-assets-panel")).toBeVisible();
    await onGlass(".more-panel");
    await banner.getByRole("button", { name: "More actions" }).tap();

    // Help on the Playbooks page: the Command palette is its last entry.
    await page
      .getByRole("navigation", { name: "Workspace views" })
      .getByRole("button", { name: "Playbooks", exact: true })
      .tap();
    await banner.getByRole("button", { name: "Help", exact: true }).tap();
    await onGlass(".help-panel");
    const palette = page.getByRole("button", {
      name: "Command palette ⌘K",
      exact: true,
    });
    await palette.scrollIntoViewIfNeeded();
    await expect(palette).toBeInViewport();
    await page.screenshot({
      path: testInfo.outputPath("phone-sideways-help.png"),
    });
    await palette.tap();
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).toBeVisible();
  });
});
