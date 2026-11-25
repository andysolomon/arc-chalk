import { type Locator, type Page } from "@playwright/test";

import { chooseWorkspaceView, expect, test } from "./fixtures";
import { expectReachable } from "./reachable";

/**
 * Every control on every phone screen can be reached by a finger. A dozen
 * phone fixes were one mistake. A control landed past the edge of the glass,
 * as zoom did at a negative x in #102 and More off the bottom of a sideways
 * phone in #193. Or it landed under another layer, as More did under the
 * sheet in #139 and the Select and Hand pill on the field in #220. This
 * opens each screen at each phone width and checks every control it shows.
 * The next one fails here and names the control, the screen, the width,
 * what covers it or which edge it crosses, and the fix.
 *
 * Each test ends on a screenshot of its screen open, on the seeded
 * "Stick — Thunder" at a fixed viewport, so a rerun draws the same picture.
 */

const VIEWPORTS = [
  { name: "360", width: 360, height: 780 },
  // A 390 px iPhone at the height Safari leaves it once its bars are drawn,
  // the shortest upright glass the app is held to.
  { name: "390", width: 390, height: 664 },
  { name: "430", width: 430, height: 932 },
  { name: "844-sideways", width: 844, height: 390 },
] as const;

interface Screen {
  readonly name: string;
  /** Opens the screen from the editor at rest, and returns its root. */
  readonly open: (page: Page) => Promise<Locator | null>;
  /** Nothing open and the field at Fit, so no control may float over it. */
  readonly atRest?: boolean;
}

const tool = (page: Page, name: string | RegExp) =>
  page.getByRole("navigation", { name: "Drawing tools" }).getByRole("button", {
    name,
  });

const drawer = (page: Page) =>
  page.getByRole("navigation", { name: "Sidebar" });

const openDrawer = async (page: Page) => {
  await page.getByRole("button", { name: "Open the sidebar" }).tap();
  await expect(drawer(page)).toBeVisible();
  return drawer(page);
};

/** A drawer page: the drawer opened on one of its rows. */
const drawerPage = (row: string): Screen["open"] => {
  return async (page) => {
    const sidebar = await openDrawer(page);
    const fold = sidebar.getByRole("button", { name: "View & library" });
    if ((await fold.getAttribute("aria-expanded")) !== "true") await fold.tap();
    await sidebar.locator(`[data-row="${row}"] > button.sidebar-row`).tap();
    await expect(sidebar.locator(".sidebar-page-title")).toBeVisible();
    return sidebar;
  };
};

const headerMenu = (button: string, panel: string): Screen["open"] => {
  return async (page) => {
    await page
      .getByRole("banner")
      .getByRole("button", { name: button, exact: true })
      .tap();
    const menu = page.locator(panel);
    await expect(menu).toBeVisible();
    return menu;
  };
};

const dialog = (
  opener: (page: Page) => Locator,
  name: string,
): Screen["open"] => {
  return async (page) => {
    await opener(page).tap();
    const found = page.getByRole("dialog", { name });
    await expect(found).toBeVisible();
    return found;
  };
};

const sheet = (page: Page) =>
  page.getByRole("complementary", { name: "Play inspector" });

/** Where a man stands on the glass: his own origin through the field's transform. */
const tapMan = async (page: Page, id: string) => {
  const centre = await page.evaluate((id) => {
    const man = document.querySelector<SVGGElement>(
      `[data-scene-player='${id}']`,
    );
    const matrix = man?.getScreenCTM();
    if (!matrix) throw new Error(`${id} is not on the field.`);
    const point = new DOMPoint(0, 0).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  }, id);
  await page.touchscreen.tap(centre.x, centre.y);
};

const SCREENS: readonly Screen[] = [
  {
    name: "the editor at rest",
    open: () => Promise.resolve(null),
    atRest: true,
  },
  { name: "the sidebar drawer", open: openDrawer },
  { name: "the drawer's Library page", open: drawerPage("library") },
  { name: "the drawer's Ball on page", open: drawerPage("ball") },
  {
    name: "the New play menu",
    open: headerMenu("New play", ".new-play-panel"),
  },
  { name: "the More menu", open: headerMenu("More actions", ".more-panel") },
  {
    name: "the Versions menu",
    open: headerMenu("Versions", ".versions-panel"),
  },
  {
    name: "the full assignments sheet",
    open: async (page) => {
      await page.getByRole("button", { name: "Show all assignments" }).tap();
      await expect(sheet(page)).toHaveAttribute("data-sheet", "full");
      return sheet(page);
    },
  },
  {
    name: "a man's quick calls",
    open: async (page) => {
      await tapMan(page, "z");
      const tray = page.getByRole("navigation", { name: "Quick calls" });
      await expect(tray).toBeVisible();
      return null;
    },
  },
  {
    name: "the Formations browser",
    open: dialog(
      (page) => tool(page, /^Add or change the formation/),
      "Formations",
    ),
  },
  {
    name: "the Defenses browser",
    open: dialog((page) => tool(page, /^Add a shadow defense/), "Defenses"),
  },
  {
    name: "the Concepts browser",
    open: dialog(
      (page) => tool(page, "Add or change the concept"),
      "Concepts and line calls",
    ),
  },
  {
    name: "the More menu's Share & assets",
    open: async (page) => {
      const more = await headerMenu("More actions", ".more-panel")(page);
      await more!.getByRole("button", { name: "Share & assets" }).tap();
      await expect(page.locator(".share-assets-panel")).toBeVisible();
      return more;
    },
  },
  {
    name: "the More menu's Clear page",
    open: async (page) => {
      const more = await headerMenu("More actions", ".more-panel")(page);
      await more!.getByRole("button", { name: /^Clear a layer/ }).tap();
      await expect(more!.locator(".clear-panel")).toBeVisible();
      return more;
    },
  },
  {
    name: "the Arrange menu",
    open: async (page) => {
      // All eleven of a fresh formation, as phone-arrange-menu picks them.
      await page.getByRole("button", { name: "New play", exact: true }).tap();
      await page
        .getByRole("group", { name: "New play" })
        .getByRole("button", { name: /^New offensive play/ })
        .tap();
      const browser = page.getByRole("dialog", { name: "Formations" });
      await browser.getByText("Gun Doubles Right", { exact: true }).tap();
      await expect(browser).toBeHidden();
      await page.keyboard.press("ControlOrMeta+a");
      const toolbar = page.getByRole("toolbar", {
        name: "Selected player actions",
      });
      await toolbar.getByRole("button", { name: "Arrange", exact: true }).tap();
      // Where the stage is short the menu may cover its own toggle.
      const menu = toolbar.getByRole("group", { name: "Arrange" });
      await expect(menu).toBeVisible();
      return menu;
    },
  },
  {
    name: "the Text panel",
    open: async (page) => {
      await tool(page, "Text — T").tap();
      const field = (await page.locator("svg.field-diagram").boundingBox())!;
      await page.touchscreen.tap(
        field.x + field.width / 2,
        field.y + field.height * 0.12,
      );
      await expect(sheet(page)).toHaveAttribute("data-sheet", "full");
      await expect(
        sheet(page).getByRole("textbox", { name: "Label text" }),
      ).toBeVisible();
      return sheet(page);
    },
  },
  {
    name: "the field zoomed in",
    open: async (page) => {
      await page.getByRole("button", { name: "Zoom in" }).tap();
      await page.getByRole("button", { name: "Zoom in" }).tap();
      await expect(
        page.getByRole("button", { name: /^Fit the field — 1[2-9]\d% zoom/ }),
      ).toBeVisible();
      return null;
    },
  },
  {
    name: "the Playbooks page",
    open: async (page) => {
      await chooseWorkspaceView(page, "Playbooks");
      await expect(
        page.getByRole("navigation", { name: "Book pages" }),
      ).toBeVisible();
      return null;
    },
  },
  {
    name: "Settings",
    open: async (page) => {
      const sidebar = await openDrawer(page);
      await sidebar
        .getByRole("button", { name: "Settings", exact: true })
        .tap();
      const settings = page.getByRole("dialog", { name: "Settings" });
      await expect(settings).toBeVisible();
      return settings;
    },
  },
];

for (const viewport of VIEWPORTS) {
  test.describe(`at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const screen of SCREENS) {
      test(`every control on ${screen.name} can be reached`, async ({
        page,
      }, testInfo) => {
        await page.goto("/?seed=starter");
        await expect(page.locator(".chalk-shell.phone-workspace")).toBeVisible({
          timeout: 30_000,
        });
        await expect(page.locator("[data-scene-player]")).toHaveCount(11);
        const where = `${screen.name} at ${viewport.width}×${viewport.height}`;
        const root = await screen.open(page);
        await expectReachable(page, root, where, { field: screen.atRest });
        await page.screenshot({
          path: testInfo.outputPath(
            `${viewport.name}-${screen.name.replaceAll(" ", "-")}.png`,
          ),
        });
      });
    }
  });
}
