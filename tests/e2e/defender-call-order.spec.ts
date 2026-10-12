import { type Locator, type Page } from "@playwright/test";
import { expect, openSeededEditor, startNewPlay, test } from "./fixtures";

/**
 * A defender's Quick assignments open on the calls his position plays: a
 * safety his deep halves, middle and quarters; a corner man and his outside
 * third; a backer his hook, curl/flat and gaps; a man on the front his rush,
 * contain and games. Each man of 4-3 Cover 3 is picked in turn, and his
 * panel is saved as the run's artifact.
 */

async function openFourThree(page: Page): Promise<void> {
  await openSeededEditor(page);
  await startNewPlay(page, "defensive");
  await page.keyboard.press("Control+Shift+d");
  const browser = page.getByRole("dialog", { name: "Defenses" });
  await expect(browser).toBeVisible();
  await browser
    .getByRole("textbox", { name: "Search defenses" })
    .fill("4-3 Cover 3");
  await browser.getByText("4-3 Cover 3", { exact: true }).click();
  await expect(browser).toBeHidden();
  await expect(
    page.locator('[data-scene-player][aria-label$="defense player"]'),
  ).toHaveCount(11);
}

/** The defender lettered `label` farthest to the left. */
async function leftmost(page: Page, label: string): Promise<Locator> {
  const men = page.locator(`[aria-label="${label} defense player"]`);
  const placed = await Promise.all(
    (await men.all()).map(async (man) => ({
      man,
      x: Number(
        /translate\(([-\d.]+)/.exec(
          (await man.getAttribute("transform")) ?? "",
        )?.[1],
      ),
    })),
  );
  return placed.sort((left, right) => left.x - right.x)[0]!.man;
}

const quickAssignments = (page: Page) =>
  page
    .locator(".section-heading", { hasText: "Quick assignments" })
    .locator("xpath=following-sibling::div[1]")
    .getByRole("button");

const positions: readonly {
  readonly label: string;
  readonly role: string;
  readonly first: readonly string[];
}[] = [
  {
    label: "F",
    role: "Free safety",
    first: ["Deep 1/2", "Middle 1/3", "Deep 1/4", "Deep 1/3", "Robber", "Man"],
  },
  {
    label: "$",
    role: "Strong safety",
    first: ["Deep 1/2", "Middle 1/3", "Deep 1/4", "Deep 1/3", "Robber", "Man"],
  },
  {
    label: "C",
    role: "Corner",
    first: ["Man", "Deep 1/3", "Deep 1/4", "Curl / flat", "Deep 1/2"],
  },
  {
    label: "M",
    role: "Mike",
    first: ["Hook", "Curl / flat", "Man", "QB spy", "A gap", "B gap"],
  },
  {
    label: "E",
    role: "End",
    first: ["Rush", "Contain", "Slant in", "Slant out"],
  },
];

test("offers each defender the calls his position plays first", async ({
  page,
}, testInfo) => {
  await openFourThree(page);

  for (const { label, role, first } of positions) {
    await page.keyboard.press("Escape");
    await (await leftmost(page, label)).click({ force: true });
    await expect(page.locator(".player-heading")).toContainText(role);
    const offered = await quickAssignments(page).allInnerTexts();
    expect(offered.slice(0, first.length), role).toEqual(first);
    // Nothing is dropped by the reordering: every man is still offered every
    // gap and every drop.
    expect(offered, role).toEqual(
      expect.arrayContaining(["A gap", "D gap", "Hook", "Deep 1/2", "Man"]),
    );
    await page
      .locator(".player-inspector")
      .screenshot({ path: testInfo.outputPath(`${label}-assignments.png`) });
  }
});
