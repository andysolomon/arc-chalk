import { type Locator, type Page } from "@playwright/test";
import { expect, openSeededEditor, startNewPlay, test } from "./fixtures";

/**
 * A defender's Quick assignments are the calls his own position plays, and
 * only those: a safety his deep halves, middle, quarters and the curl/flat
 * Cover 3 rotates him to; a corner man and his outside third; a backer his
 * hook, curl/flat and gaps; a man on the front his rush, contain, games and
 * gaps. The rest of the defense's calls are still his to be given, folded
 * under Other assignments. Each man of 4-3 Cover 3 is picked in turn, and his
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

const otherAssignments = (page: Page) =>
  page.locator('[data-disclosure="player-other-assignments"]');

const positions: readonly {
  readonly label: string;
  readonly role: string;
  /** His Quick assignments, all of them, in the order they are offered. */
  readonly own: readonly string[];
  /** What is folded away from him: the other positions' calls. */
  readonly other: readonly string[];
}[] = [
  {
    label: "F",
    role: "Free safety",
    own: [
      "Deep 1/2",
      "Middle 1/3",
      "Deep 1/4",
      "Deep 1/3",
      "Robber",
      "Curl / flat",
      "Man",
    ],
    other: ["Hook", "QB spy", "A gap", "B gap", "C gap", "D gap"],
  },
  {
    label: "$",
    role: "Strong safety",
    own: [
      "Deep 1/2",
      "Middle 1/3",
      "Deep 1/4",
      "Deep 1/3",
      "Robber",
      "Curl / flat",
      "Man",
    ],
    other: ["Hook", "QB spy", "A gap", "B gap", "C gap", "D gap"],
  },
  {
    label: "C",
    role: "Corner",
    own: ["Man", "Deep 1/3", "Deep 1/4", "Curl / flat", "Deep 1/2"],
    other: [
      "Hook",
      "Middle 1/3",
      "Robber",
      "QB spy",
      "A gap",
      "B gap",
      "C gap",
      "D gap",
    ],
  },
  {
    label: "M",
    role: "Mike",
    own: [
      "Hook",
      "Curl / flat",
      "Man",
      "QB spy",
      "A gap",
      "B gap",
      "C gap",
      "D gap",
    ],
    other: ["Deep 1/3", "Deep 1/2", "Middle 1/3", "Robber", "Deep 1/4"],
  },
  {
    label: "E",
    role: "End",
    own: [
      "Rush",
      "Contain",
      "Slant in",
      "Slant out",
      "T-E twist",
      "E-T twist",
      "Spill",
      "Squeeze",
      "A gap",
      "B gap",
      "C gap",
      "D gap",
    ],
    other: [
      "Hook",
      "Curl / flat",
      "Deep 1/3",
      "Deep 1/2",
      "Middle 1/3",
      "Robber",
      "Man",
      "Deep 1/4",
      "QB spy",
    ],
  },
];

test("offers each defender his own position's calls and folds the rest away", async ({
  page,
}, testInfo) => {
  await openFourThree(page);

  for (const { label, role, own, other } of positions) {
    await page.keyboard.press("Escape");
    await (await leftmost(page, label)).click({ force: true });
    await expect(page.locator(".player-heading")).toContainText(role);
    // The grid is his position's calls and nothing else: a Mike is not
    // offered the safeties' deep zones beside his own.
    await expect(quickAssignments(page), role).toHaveText([...own]);
    // The other positions' calls stay folded, named but not in the way.
    const fold = otherAssignments(page);
    await expect(
      fold.getByRole("button", { name: "Other assignments" }),
      role,
    ).toHaveAttribute("aria-expanded", "false");
    await expect(fold.locator(".button-grid"), role).toHaveCount(0);
    await expect(fold.locator(".disclosure-summary"), role).toHaveText(
      other.slice(0, 4).join(" · "),
    );
    await page
      .locator(".player-inspector")
      .screenshot({ path: testInfo.outputPath(`${label}-assignments.png`) });
  }
});

test("keeps every other call his to be given, under Other assignments", async ({
  page,
}, testInfo) => {
  await openFourThree(page);

  // Unfolded once, it stays open from man to man, and between his own calls
  // and the rest nothing the defense can be given is lost.
  await (await leftmost(page, "M")).click({ force: true });
  await otherAssignments(page)
    .getByRole("button", { name: "Other assignments" })
    .click();
  for (const { label, role, own, other } of positions) {
    await page.keyboard.press("Escape");
    await (await leftmost(page, label)).click({ force: true });
    await expect(page.locator(".player-heading")).toContainText(role);
    await expect(quickAssignments(page), role).toHaveText([...own]);
    await expect(
      otherAssignments(page).locator(".button-grid").getByRole("button"),
      role,
    ).toHaveText([...other]);
  }

  // A corner sent through the D gap: not a corner's call, but his when the
  // scheme asks for it.
  await page.keyboard.press("Escape");
  await (await leftmost(page, "C")).click({ force: true });
  const sent = otherAssignments(page)
    .locator(".button-grid")
    .getByRole("button", { name: "D gap", exact: true });
  await sent.click();
  await expect(sent).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator(".player-inspector .line-list").first(),
  ).toContainText("D gap");

  // Folded again, the heading says the call he is running from it.
  await otherAssignments(page)
    .getByRole("button", { name: "Other assignments" })
    .click();
  await expect(
    otherAssignments(page).locator(".disclosure-summary"),
  ).toHaveText("D gap");
  await page
    .locator(".player-inspector")
    .screenshot({ path: testInfo.outputPath("corner-sent-d-gap.png") });
});
