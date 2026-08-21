import { expect, test, type Page } from "@playwright/test";

import {
  captureNamedGolden,
  clickFieldPoint,
  clickPlayerByLetter,
  loadCanonicalPrototype,
} from "./prototype-harness";

const captureMode = async (
  page: Page,
  mode: "Editor" | "Demo" | "Present" | "Print",
): Promise<void> => {
  const modeButton = page
    .getByRole("button", { name: mode, exact: true })
    .first();

  if (mode !== "Editor") {
    await modeButton.click();
  }

  if (mode === "Demo") {
    await page.getByRole("button", { name: "Pause", exact: true }).click();
  }

  await expect(modeButton).toBeVisible();
  await captureNamedGolden(
    page,
    `original-${mode.toLowerCase()}-desktop-1440x960.png`,
    // The original Demo runtime advances its hand-drawn cursor on requestAnimationFrame
    // even after Pause. Keep the golden strict everywhere else while tolerating its
    // tiny antialiasing shimmer (well under 0.01% of this viewport).
    mode === "Demo" ? 50 : 0,
  );
};

test.describe("canonical prototype top-level modes", () => {
  for (const mode of ["Editor", "Demo", "Present", "Print"] as const) {
    test(`${mode} has a locked desktop golden`, async ({ page }) => {
      await loadCanonicalPrototype(page);
      await captureMode(page, mode);
    });
  }
});

test.describe("canonical prototype editor overlays", () => {
  test.beforeEach(async ({ page }) => {
    await loadCanonicalPrototype(page);
  });

  test("More menu has a locked desktop golden", async ({ page }) => {
    await page.getByTitle("More actions").click();
    await expect(page.getByText("Focus mode", { exact: true })).toBeVisible();
    await captureNamedGolden(
      page,
      "original-editor-more-menu-desktop-1440x960.png",
    );
  });

  test("Export menu has a locked desktop golden", async ({ page }) => {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(page.getByText("DIAGRAM", { exact: true })).toBeVisible();
    await captureNamedGolden(
      page,
      "original-editor-export-menu-desktop-1440x960.png",
    );
  });

  test("Save and version menu has a locked desktop golden", async ({
    page,
  }) => {
    await page.keyboard.press("Control+s");
    await expect(
      page.getByRole("button", { name: "Save as variant", exact: true }),
    ).toBeVisible();
    await captureNamedGolden(
      page,
      "original-editor-save-menu-desktop-1440x960.png",
    );
  });

  test("command palette has a locked desktop golden", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await expect(
      page.getByPlaceholder(
        "Type a command — formation, defense, export, clear…",
      ),
    ).toBeVisible();
    await captureNamedGolden(
      page,
      "original-editor-command-palette-desktop-1440x960.png",
    );
  });

  test("shortcut reference has a locked desktop golden", async ({ page }) => {
    await page
      .getByRole("button", { name: "Shortcuts ?", exact: true })
      .click();
    await expect(
      page.getByText("Keyboard shortcuts", { exact: true }),
    ).toBeVisible();
    await captureNamedGolden(
      page,
      "original-editor-shortcuts-desktop-1440x960.png",
    );
  });

  test("Formation browser has a locked desktop golden", async ({ page }) => {
    await page.getByTitle("Browse formations — ⇧⌘F").click();
    await expect(
      page.getByPlaceholder("Search — gun, trips, empty, 12…"),
    ).toBeVisible();
    await captureNamedGolden(
      page,
      "original-editor-formations-desktop-1440x960.png",
    );
  });

  test("Defense browser has a locked desktop golden", async ({ page }) => {
    await page.getByTitle("Browse defenses — ⇧⌘D").click();
    await expect(
      page.getByPlaceholder("Search — cover 3, nickel, blitz…"),
    ).toBeVisible();
    await captureNamedGolden(
      page,
      "original-editor-defenses-desktop-1440x960.png",
    );
  });

  test("Clear menu has a locked desktop golden", async ({ page }) => {
    await page.getByTitle("Clear a layer").click();
    await expect(page.getByText("Coverage", { exact: true })).toBeVisible();
    await captureNamedGolden(
      page,
      "original-editor-clear-menu-desktop-1440x960.png",
    );
  });

  test("snapshot naming field has a locked desktop golden", async ({
    page,
  }) => {
    await page.keyboard.press("Control+s");
    await page.getByRole("button", { name: "Snapshot", exact: true }).click();
    await expect(page.getByPlaceholder("What this state is")).toBeVisible();
    await captureNamedGolden(
      page,
      "original-editor-snapshot-desktop-1440x960.png",
    );
  });

  test("Export Position view submenu has a locked desktop golden", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByText("Position view", { exact: true }).click();
    await expect(page.getByText("Receivers", { exact: true })).toBeVisible();
    await captureNamedGolden(
      page,
      "original-editor-export-position-desktop-1440x960.png",
    );
  });
});

test.describe("canonical prototype selection and inspector states", () => {
  test.beforeEach(async ({ page }) => {
    await loadCanonicalPrototype(page);
  });

  test("a selected Player has a locked desktop golden", async ({ page }) => {
    await clickPlayerByLetter(page, "Q");
    await expect(page.getByPlaceholder("Letter — X, Y, Z, Q…")).toBeVisible();
    await captureNamedGolden(
      page,
      "original-editor-player-selected-desktop-1440x960.png",
    );
  });

  test("a selected route has a locked desktop golden", async ({ page }) => {
    // X's first break lives at canvas (308, 416) in the seeded Stick Play.
    await clickFieldPoint(page, 308, 416);
    await expect(page.getByText("Coaching", { exact: true })).toBeVisible();
    await captureNamedGolden(
      page,
      "original-editor-route-selected-desktop-1440x960.png",
    );
  });

  test("a selected label has a locked desktop golden", async ({ page }) => {
    await page.getByText("YES / NO", { exact: true }).click();
    await expect(page.getByText("Meaning", { exact: true })).toBeVisible();
    await captureNamedGolden(
      page,
      "original-editor-label-selected-desktop-1440x960.png",
    );
  });

  test("the player context menu has a locked desktop golden", async ({
    page,
  }) => {
    await clickPlayerByLetter(page, "Q", "right");
    await expect(
      page.getByRole("button", { name: "Bring forward", exact: true }),
    ).toBeVisible();
    await captureNamedGolden(
      page,
      "original-editor-context-menu-desktop-1440x960.png",
    );
  });
});

test.describe("canonical prototype chrome collapse states", () => {
  test.beforeEach(async ({ page }) => {
    await loadCanonicalPrototype(page);
  });

  test("Focus mode has a locked desktop golden", async ({ page }) => {
    await page.getByTitle("More actions").click();
    await page.getByText("Focus mode", { exact: true }).click();
    await expect(page.getByTitle("Show the tools — ⌥2")).toBeVisible();
    await captureNamedGolden(
      page,
      "original-editor-focus-mode-desktop-1440x960.png",
    );
  });

  test("tools hidden has a locked desktop golden", async ({ page }) => {
    await page.getByTitle("Hide the tools — ⌥2").click();
    await expect(page.getByTitle("Show the tools — ⌥2")).toBeVisible();
    await captureNamedGolden(
      page,
      "original-editor-tools-hidden-desktop-1440x960.png",
    );
  });
});

test.describe("canonical prototype supported viewports", () => {
  test("Editor has a locked iPad golden", async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1194 });
    await loadCanonicalPrototype(page);
    await captureNamedGolden(page, "original-editor-ipad-834x1194.png");
  });

  test("Present has a locked iPad golden", async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1194 });
    await loadCanonicalPrototype(page);
    await page.getByRole("button", { name: "Present", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Present", exact: true }),
    ).toBeVisible();
    await captureNamedGolden(page, "original-present-ipad-834x1194.png");
  });

  test("Print has a locked iPad golden", async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1194 });
    await loadCanonicalPrototype(page);
    await page.getByRole("button", { name: "Print", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Print", exact: true }),
    ).toBeVisible();
    await captureNamedGolden(page, "original-print-ipad-834x1194.png");
  });

  test("Editor has a locked phone golden", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadCanonicalPrototype(page);
    await captureNamedGolden(page, "original-editor-phone-390x844.png");
  });
});
