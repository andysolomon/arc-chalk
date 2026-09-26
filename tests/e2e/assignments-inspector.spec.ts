import { expect, test } from "./fixtures";

/**
 * ADR 0058: the right inspector is assignments only. What is not about what
 * a man is asked to do — formation, ball, the shadow, library, layers, print,
 * field — lives in the sidebar or in Settings, on a desktop, an iPad and a
 * phone alike.
 */
const VIEWPORTS = [
  ["reviewed desktop", { width: 1363, height: 936 }, false],
  ["iPad landscape", { width: 1194, height: 834 }, false],
  ["phone", { width: 390, height: 844 }, true],
] as const;

for (const [label, viewport, phone] of VIEWPORTS) {
  test.describe(label, () => {
    test.use({
      viewport,
      ...(phone
        ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
        : {}),
    });

    test("keeps the inspector to the play call and the men", async ({
      page,
    }) => {
      await page.goto("/");
      const inspector = page.getByRole("complementary", {
        name: "Play inspector",
      });
      await expect(inspector).toBeVisible();
      if (phone) {
        await expect(inspector).toHaveAttribute("data-sheet", "peek");
        await page.getByRole("button", { name: "Show all assignments" }).tap();
        await expect(inspector).toHaveAttribute("data-sheet", "full");
      }
      await expect(inspector.getByText("Assignments")).toBeVisible();
      await expect(
        inspector.getByRole("button", { name: /Concept ›/ }),
      ).toBeVisible();
      await expect(
        inspector.getByRole("button", { name: /Line call ›/ }),
      ).toBeVisible();
      await expect(inspector.getByText("Skill", { exact: true })).toBeVisible();
      await expect(inspector.getByText("Line", { exact: true })).toBeVisible();

      // Nothing about the play's setup, the field or the outputs.
      for (const name of [
        /Browse formations/,
        /^Formation/,
        /^Ball on/,
        /^Shadow/,
        /^Library/,
        /^Layers/,
        /^Show on/,
        /^Print/,
        /^Field$/,
        /^Half field/,
        /^History/,
        /^Playbook settings/,
        /^Commands/,
        /^Shortcuts/,
      ]) {
        await expect(inspector.getByRole("button", { name })).toHaveCount(0);
      }
      await expect(inspector.getByTitle("Browse formations — ⇧⌘F")).toHaveCount(
        0,
      );
      await expect(inspector.getByTitle("Browse defenses — ⇧⌘D")).toHaveCount(
        0,
      );

      // A man's row opens his panel, which is his alone.
      await inspector.getByRole("button", { name: /^Y: / }).click();
      await expect(
        inspector.getByRole("textbox", { name: "Tag under" }),
      ).toBeVisible();
      await expect(inspector.getByText("Quick routes")).toBeVisible();
      await expect(
        inspector.getByRole("button", { name: /^Quick blocks/ }),
      ).toBeVisible();
      await expect(inspector.getByTitle("Browse formations — ⇧⌘F")).toHaveCount(
        0,
      );
      await expect(
        inspector.getByRole("button", { name: /^Print/ }),
      ).toHaveCount(0);

      // Those things are the sidebar's: docked on a desktop, a drawer off ≡
      // on a phone.
      if (phone) {
        await page.getByRole("button", { name: "Open the sidebar" }).tap();
      }
      const sidebar = page.getByRole("navigation", { name: "Sidebar" });
      await expect(sidebar).toBeVisible();
      await expect(sidebar.getByTitle("Browse formations — ⇧⌘F")).toBeVisible();
      for (const name of [
        /^Ball on/,
        /^Shadow defense/,
        /^Type of play/,
        /^Show on field/,
        /^Library/,
        /^Settings/,
        /^Help/,
      ]) {
        await expect(sidebar.getByRole("button", { name })).toBeVisible();
      }
      await expect(
        sidebar.getByRole("button", { name: "Print & export" }),
      ).toBeVisible();
    });
  });
}
