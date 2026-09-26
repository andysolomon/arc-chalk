import type { Page } from "@playwright/test";

import { expect, openSeededEditor, test } from "./fixtures";

/**
 * The Playbooks destination's three pages (ADR 0060): the open book with its
 * Plays as cards or a list, the book of sets and calls with the filters that
 * narrow it, and every Play with a chip per axis and a picker behind each.
 * Each test ends with a screenshot of the page it left the Coach on.
 */

const openPlaybooks = async (page: Page) => {
  await openSeededEditor(page);
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Playbooks", exact: true })
    .click();
  const pages = page.getByRole("navigation", { name: "Playbooks pages" });
  await expect(pages).toBeVisible();
  return pages;
};

test("opens on the book, which lists its plays as cards or a list", async ({
  page,
}, testInfo) => {
  const pages = await openPlaybooks(page);
  for (const name of ["Playbooks", "Formations", "Plays"]) {
    await expect(
      pages.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  }
  await expect(
    pages.getByRole("button", { name: "Playbooks", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // The open book's bar: its name, a way back to the shelf, its two pages.
  const book = page.getByRole("navigation", { name: "Book pages" });
  await expect(book.getByRole("button", { name: "Plays" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".book-title strong")).toHaveText(
    "Chalk Starter Playbook",
  );

  // Cards on a desk, and a list when asked for.
  const scroller = page.locator(".playbook-scroll");
  await expect(scroller).toHaveAttribute("data-layout", "grid");
  const layout = page.getByRole("group", { name: "Layout" });
  await layout.getByRole("button", { name: "List" }).click();
  await expect(scroller).toHaveAttribute("data-layout", "list");
  await expect(scroller).toHaveAttribute("data-grid-columns", "1");
  await expect(page.locator(".playbook-row").first()).toBeVisible();

  // The choice survives leaving and coming back.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: "Play name" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Playbooks", exact: true })
    .click();
  await expect(page.locator(".playbook-scroll")).toHaveAttribute(
    "data-layout",
    "list",
  );

  // Back out to the shelf, where the open book is the one that opens.
  await page
    .getByRole("button", { name: /Playbooks$/ })
    .last()
    .click();
  const shelf = page.getByRole("region", { name: "Playbooks" });
  await expect(shelf.locator(".shelf-card.open")).toHaveCount(1);
  await expect(shelf.locator(".shelf-card.open strong")).toHaveText(
    "Chalk Starter Playbook",
  );
  await shelf.getByRole("button", { name: "Open" }).click();
  await expect(page.locator(".book-title strong")).toHaveText(
    "Chalk Starter Playbook",
  );
  await page.screenshot({
    path: testInfo.outputPath("playbooks-book-list.png"),
    fullPage: true,
  });
});

test("filters the book's plays by formation and personnel from a picker", async ({
  page,
}, testInfo) => {
  await openPlaybooks(page);
  const filters = page.getByRole("group", { name: "Filter plays" });
  // The count reads the book once it has loaded, not the empty one before.
  await expect(page.locator("[data-play-id]").nth(1)).toBeVisible();
  const count = page.locator(".playbook-count");
  const total = Number((await count.textContent())?.match(/\d+/)?.[0]);
  expect(total).toBeGreaterThan(1);

  // Formation opens its choices with how many plays stand in each.
  await filters.getByRole("button", { name: "Formation" }).click();
  const picker = page.getByRole("dialog", { name: "Filter formation" });
  await expect(picker).toBeVisible();
  const options = picker.getByRole("option");
  await expect(options.first()).toHaveText("All");
  await expect(options).not.toHaveCount(1);
  const gun = picker.getByRole("option", { name: /^Gun/ });
  await expect(gun).toBeVisible();
  const inGun = Number((await gun.textContent())?.match(/\d+$/)?.[0]);
  await gun.click();
  await expect(picker).toBeHidden();
  await expect(
    filters.getByRole("button", { name: "Formation: Gun" }),
  ).toBeVisible();
  await expect(count).toHaveText(`${inGun} of ${total} plays`);

  // Personnel says what a label puts on the field.
  await filters.getByRole("button", { name: "Personnel" }).click();
  const personnel = page.getByRole("dialog", { name: "Filter personnel" });
  await expect(personnel.getByRole("option", { name: /^11/ })).toContainText(
    "1 RB, 1 TE, 3 WR",
  );
  await personnel.getByRole("option", { name: /^11/ }).click();
  await expect(
    filters.getByRole("button", { name: "Personnel: 11" }),
  ).toBeVisible();

  // Clear opens the whole book back up.
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(count).toHaveText(`${total} plays`);
  await expect(
    filters.getByRole("button", { name: "Formation" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("playbooks-book-filters.png"),
    fullPage: true,
  });
});

test("lists sets and calls on the Formations page and finds the plays in a set", async ({
  page,
}, testInfo) => {
  const pages = await openPlaybooks(page);
  await pages.getByRole("button", { name: "Formations", exact: true }).click();
  const formations = page.getByRole("region", { name: "Formations" });
  await expect(formations).toBeVisible();
  const filters = formations.getByRole("group", {
    name: "Filter formations",
  });

  // Both sides of the ball are on the page, grouped by what they are called from.
  await expect(
    formations.locator(".browser-group-head", { hasText: /^Gun/ }),
  ).toBeVisible();
  await expect(
    formations.locator(".browser-group-head", { hasText: "4-3 front" }),
  ).toBeVisible();
  const offenseCards = formations.locator(".formation-card[data-unit=offense]");
  const defenseCards = formations.locator(".formation-card[data-unit=defense]");
  await expect(offenseCards).toHaveCount(18);
  expect(await defenseCards.count()).toBeGreaterThan(5);

  // Under Defense the axes are the front and the coverage; Package steps aside.
  await filters.getByRole("button", { name: "Defense" }).click();
  await expect(offenseCards).toHaveCount(0);
  await expect(filters.getByRole("button", { name: "Front" })).toBeVisible();
  await expect(filters.getByRole("button", { name: "Coverage" })).toBeVisible();
  await expect(filters.getByRole("button", { name: "Package" })).toHaveCount(0);
  await filters.getByRole("button", { name: "Coverage" }).click();
  await page
    .getByRole("dialog", { name: "Filter coverage" })
    .getByRole("option", { name: /^Cover 3/ })
    .click();
  for (const card of await defenseCards.all()) {
    await expect(card.locator(".browser-chip")).toContainText("Cover 3");
  }

  // Under Offense: Formation, Set, Personnel and Package, each counted.
  await filters.getByRole("button", { name: "Offense" }).click();
  await expect(defenseCards).toHaveCount(0);
  await filters.getByRole("button", { name: "Package" }).click();
  const packages = page.getByRole("dialog", { name: "Filter package" });
  await expect(packages.getByRole("option", { name: /^3 WR/ })).toBeVisible();
  await packages.getByRole("option", { name: /^2 TE/ }).click();
  for (const card of await offenseCards.all()) {
    await expect(card.locator(".browser-chip")).toContainText("12");
  }
  await formations.getByRole("button", { name: "Clear" }).click();
  await page.screenshot({
    path: testInfo.outputPath("formations-page.png"),
    fullPage: true,
  });

  // A set's card leads to the plays that stand in it.
  const seeded = formations.locator(".formation-card", {
    hasText: /\d+ plays?$/,
  });
  await expect(seeded.first()).toBeVisible();
  const setName = await seeded.first().locator(".browser-name").textContent();
  await seeded.first().locator(".browser-name").click();
  await expect(
    pages.getByRole("button", { name: "Plays", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const pinned = page.getByRole("button", { name: `Set: ${setName}. Remove` });
  await expect(pinned).toBeVisible();
  await expect(page.locator("[data-play-id]").first()).toBeVisible();
  await expect(
    page.locator(".playbook-card-type").filter({ hasNotText: setName! }),
  ).toHaveCount(0);
  expect(await page.locator(".playbook-card-type").count()).toBeGreaterThan(0);
  await page.screenshot({
    path: testInfo.outputPath("plays-from-a-set.png"),
    fullPage: true,
  });
});

test("the Plays page carries every axis and an Advanced row", async ({
  page,
}, testInfo) => {
  const pages = await openPlaybooks(page);
  await pages.getByRole("button", { name: "Plays", exact: true }).click();
  const filters = page.getByRole("group", { name: "Filter plays" });
  for (const name of ["Type", "Playbook", "Formation", "Set", "Personnel"]) {
    await expect(filters.getByRole("button", { name })).toBeVisible();
  }
  await expect(page.getByRole("group", { name: "More filters" })).toHaveCount(
    0,
  );
  await filters.getByRole("button", { name: "Advanced" }).click();
  const more = page.getByRole("group", { name: "More filters" });
  for (const name of ["Concept", "Tag", "Motion"]) {
    await expect(more.getByRole("button", { name })).toBeVisible();
  }

  // The picker filters its own choices by a typed line.
  await filters.getByRole("button", { name: "Set" }).click();
  const picker = page.getByRole("dialog", { name: "Filter set" });
  const search = picker.getByRole("searchbox", { name: "Filter set" });
  if (await search.isVisible()) {
    await search.fill("trips");
    await expect(picker.getByRole("option")).toHaveCount(1);
  }
  await picker.getByRole("option", { name: /Trips/ }).click();
  await expect(
    filters.getByRole("button", { name: "Set: Trips" }),
  ).toBeVisible();
  const count = page.locator(".playbook-count");
  await expect(count).toHaveText(/\d+ of \d+ plays/);

  // Motion narrows to the plays that carry a motion line.
  await more.getByRole("button", { name: "Motion" }).click();
  await page
    .getByRole("dialog", { name: "Filter motion" })
    .getByRole("option", { name: /With motion/ })
    .click();
  await expect(
    more.getByRole("button", { name: "Motion: With motion" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("plays-page-filters.png"),
    fullPage: true,
  });
});
