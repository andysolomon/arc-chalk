import { writeFile } from "node:fs/promises";

import type { FrameLocator, Page } from "@playwright/test";

import { expect, openBlankEditor, test } from "./fixtures";

/**
 * Issue #156: a Full playbook is the book it came from. The cover and every
 * sheet's foot carry the book's name, the contents run in the order the
 * book's page is sorted in — by name here — unless the Coach picks another
 * order in Print & export, and a line call reads as the call it is: Drive
 * and Reach read apart in the roster and the install table, never as a bare
 * "Block". A
 * second book prints under its own name. The spec saves the printed HTML of
 * each book and ends with a screenshot of the Print & export page.
 */
test.use({ viewport: { width: 1440, height: 960 } });

/** The three plays, made in this order so it differs from their name order. */
const PLAYS = [
  { name: "O304 28 Stretch", call: /^Reach Line calls/, word: "Reach" },
  { name: "O301 Quick Game", call: /^Pass set Line calls/, word: "Pass set" },
  { name: "O303 24 Lead", call: /^Drive Line calls/, word: "Drive" },
] as const;

const BY_NAME = ["O301 Quick Game", "O303 24 Lead", "O304 28 Stretch"];
const MOST_RECENT_FIRST = [
  "O303 24 Lead",
  "O301 Quick Game",
  "O304 28 Stretch",
];

const bookPage = async (page: Page) => {
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Playbooks", exact: true })
    .click();
  await expect(page.locator(".book-title strong")).toBeVisible();
};

const editor = async (page: Page) => {
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Editor", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "Play name" })).toBeVisible();
};

/** Gun Doubles Right, named, with one call on the whole line, then saved. */
async function makePlay(
  page: Page,
  play: { readonly name: string; readonly call: RegExp },
  /** A new play opens on the Formations browser (ADR 0077). */
  browserOpen = false,
) {
  const formations = page.getByRole("dialog", { name: "Formations" });
  if (browserOpen) await expect(formations).toBeVisible();
  else await page.getByTitle("Browse formations — ⇧⌘F").click();
  await formations.getByText("Gun Doubles Right", { exact: true }).click();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  const name = page.getByRole("textbox", { name: "Play name" });
  await name.fill(play.name);
  await name.press("Enter");
  const summary = page.getByRole("button", { name: /Line call ›/ });
  await summary.click();
  const picker = page.getByRole("dialog", { name: "Concepts and line calls" });
  await picker.getByRole("button", { name: play.call }).first().click();
  await expect(picker).toBeHidden();
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page.getByRole("button", { name: /^Save ⌘S/ }).click();
  await expect(page.getByRole("button", { name: /^Save ⌘S/ })).toBeHidden();
}

/** Opens Print & export on the whole book as a binder, and returns the preview. */
async function fullPlaybook(page: Page) {
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Print & export", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Print preview", exact: true })
    .click();
  const output = page.getByRole("region", { name: "Print & export" });
  await output.getByRole("radio", { name: "Full playbook" }).click();
  await output.getByRole("button", { name: /^Binder playbook/ }).click();
  return {
    output,
    status: output.getByRole("status", { name: "What prints" }),
    preview: page.frameLocator('iframe[title="Preview"]'),
  };
}

/**
 * The contents rows' names, top to bottom — nothing while the preview is
 * being replaced by a new sheet, so a poll asks again.
 */
const contentsNames = (preview: FrameLocator): Promise<string[]> =>
  preview
    .locator("[data-contents-for] > span:first-child")
    .evaluateAll((rows) =>
      rows.map((row) => row.firstChild?.textContent?.trim() ?? ""),
    )
    .catch(() => []);

/** Every install page's assignment column, keyed by the page's play. */
const assignmentsByPage = (preview: FrameLocator) =>
  preview
    .locator(".pg[data-book-page]:has(table)")
    .evaluateAll((pages) =>
      Object.fromEntries(
        pages.map((page) => [
          page.querySelector("h1")?.textContent?.trim() ?? "",
          [...page.querySelectorAll("tbody tr")].map(
            (row) => row.children[1]?.textContent?.trim() ?? "",
          ),
        ]),
      ),
    );

const printedHtml = (preview: FrameLocator) =>
  preview
    .locator("html")
    .evaluate((root) => `<!doctype html>${root.outerHTML}`);

test("prints the book under its name, in its page's order, with every line call named", async ({
  page,
  browserName,
}, testInfo) => {
  // Four plays made and two books printed: past the default budget on an iPad.
  test.setTimeout(90_000);
  await openBlankEditor(page);

  // Three plays, each with a call on the whole line. Reach first, so the
  // order they were made in is neither their name order nor the reverse.
  await makePlay(page, PLAYS[0]);

  // A blank device's book is written with its first play (ADR 0064,
  // organizing a library), and is then named for what it is.
  await bookPage(page);
  await page.getByRole("button", { name: "Rename Playbook" }).click();
  const rename = page.getByRole("form", { name: "Playbook name" });
  await rename
    .getByRole("textbox", { name: "Playbook name" })
    .fill("Cobb Comets Offense");
  await rename.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".book-title strong")).toHaveText(
    "Cobb Comets Offense",
  );
  await editor(page);

  for (const play of PLAYS.slice(1)) {
    await page
      .getByRole("banner")
      .getByRole("button", { name: "New play" })
      .click();
    await page
      .getByRole("group", { name: "New play" })
      .getByRole("button", { name: /^New offensive play/ })
      .click();
    await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
      "Untitled play",
    );
    await makePlay(page, play, true);
  }

  // The roster reads each lineman's block as the call it is.
  await expect(
    page.locator(".roster-summary", { hasText: "Drive" }),
  ).toHaveCount(5);

  // The book's page is sorted most recently edited first; the Full playbook
  // follows it and says so.
  await bookPage(page);
  const sort = page.getByRole("combobox", { name: "Sort plays" });
  await sort.selectOption("recent");
  await expect(sort).toHaveValue("recent");
  await editor(page);
  {
    const { output, status, preview } = await fullPlaybook(page);
    await expect(status).toContainText(
      "Full playbook: Cobb Comets Offense · 3 plays · most recently edited first",
    );
    await expect(
      output.getByRole("combobox", { name: "Print order" }),
    ).toHaveValue("recent");
    await expect(output).toContainText("as the book's page reads");
    await expect(preview.locator(".cov h1")).toHaveText("Cobb Comets Offense");
    await expect.poll(() => contentsNames(preview)).toEqual(MOST_RECENT_FIRST);
    await page.keyboard.press("Escape");
  }

  // Sorted by name, the book prints by name: cover, contents and the page
  // foot all carry the book's name, and the contents says the order.
  await bookPage(page);
  await sort.selectOption("name");
  await expect(sort).toHaveValue("name");
  await editor(page);
  const { output, status, preview } = await fullPlaybook(page);
  await expect(status).toContainText(
    "Full playbook: Cobb Comets Offense · 3 plays · in name order",
  );
  await expect(preview.locator(".cov h1")).toHaveText("Cobb Comets Offense");
  await expect(preview.locator(".cov")).not.toContainText("Full playbook");
  await expect(
    preview.locator('[data-book-page="contents"] .hd span'),
  ).toHaveText("3 plays · in name order");
  await expect.poll(() => contentsNames(preview)).toEqual(BY_NAME);
  await expect(preview.locator("[data-book-page]")).toHaveCount(5);

  // Drive against Reach: the two line calls print as the calls they are,
  // and nothing on any page is a bare "Block".
  const assignments = await assignmentsByPage(preview);
  expect(assignments["O303 24 Lead"]).toEqual(Array(5).fill("Drive"));
  expect(assignments["O304 28 Stretch"]).toEqual(Array(5).fill("Reach"));
  expect(assignments["O301 Quick Game"]).toEqual(Array(5).fill("Pass set"));
  await expect(preview.locator("td", { hasText: /^Block$/ })).toHaveCount(0);
  await writeFile(
    testInfo.outputPath("cobb-comets-offense-by-name.html"),
    await printedHtml(preview),
  );

  // The order is the Coach's to change here: library order groups by
  // concept, and the status and the contents say which order is in use.
  const order = output.getByRole("combobox", { name: "Print order" });
  await order.selectOption("library");
  await expect(status).toContainText("in library order");
  await expect(output).not.toContainText("as the book's page reads");
  await expect(
    preview.locator('[data-book-page="contents"] .hd span'),
  ).toHaveText("3 plays · in library order");
  await order.selectOption("recent");
  await expect(status).toContainText("most recently edited first");
  await expect.poll(() => contentsNames(preview)).toEqual(MOST_RECENT_FIRST);
  await page.keyboard.press("Escape");

  // The editor's own Print → Full playbook is the same book: named on the
  // cover and in the foot of every sheet, in the page's order, no "Block".
  if (browserName === "chromium") {
    await editor(page);
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Print & export", exact: true })
      .click();
    const [printed] = await Promise.all([
      page.waitForEvent("popup"),
      page
        .locator(".export-panel")
        .getByRole("button", { name: "Full playbook", exact: true })
        .click(),
    ]);
    await expect(printed.locator(".cov h1")).toHaveText("Cobb Comets Offense");
    await expect(printed).toHaveTitle("Cobb Comets Offense — playbook — Chalk");
    await expect(printed.locator(".__pn")).toContainText("Cobb Comets Offense");
    await expect(printed.locator(".hd span").first()).toHaveText(
      "3 plays · in name order",
    );
    await expect(printed.locator(".tr > span:first-child")).toHaveText(BY_NAME);
    await expect(printed.locator("td", { hasText: /^Block$/ })).toHaveCount(0);
    await expect(printed.locator("td", { hasText: /^Drive$/ })).toHaveCount(5);
    await expect(printed.locator("td", { hasText: /^Reach$/ })).toHaveCount(5);
    await writeFile(
      testInfo.outputPath("cobb-comets-offense-print-menu.html"),
      await printed.content(),
    );
    await printed.close();
    await page.keyboard.press("Escape");
  }

  // A second book prints under its own name, not the first's.
  await bookPage(page);
  await page
    .getByRole("button", { name: /Playbooks$/ })
    .last()
    .click();
  const shelf = page.getByRole("region", { name: "Playbooks" });
  const newName = shelf.getByRole("textbox", { name: "New playbook name" });
  await newName.fill("Comets JV");
  await newName.press("Enter");
  await expect(page.locator(".book-title strong")).toHaveText("Comets JV");
  await editor(page);
  await makePlay(page, {
    name: "O101 Base Pass",
    call: /^Pass set Line calls/,
  });
  const second = await fullPlaybook(page);
  await expect(second.status).toContainText("Full playbook: Comets JV");
  await expect(second.preview.locator(".cov h1")).toHaveText("Comets JV");
  await expect
    .poll(() => contentsNames(second.preview))
    .toContain("O101 Base Pass");
  await expect
    .poll(() => contentsNames(second.preview))
    .not.toContain("O303 24 Lead");
  await writeFile(
    testInfo.outputPath("comets-jv.html"),
    await printedHtml(second.preview),
  );
  await page.screenshot({
    path: testInfo.outputPath("playbook-print-identity.png"),
  });
});
