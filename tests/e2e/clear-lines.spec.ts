import {
  canonicalSha256,
  stickThunderPlay,
  type PlayDocument,
} from "@chalk/domain";
import { type Page } from "@playwright/test";

import { expect, openBlankEditor, test } from "./fixtures";

/**
 * Clearing every line takes the names the lines gave (issue #153). A concept
 * names each man's route; Clear every line takes the routes and their names
 * together, the count drops to nobody, and the toast says what went. A line
 * call then counts only the five it drew, and undo brings the routes and
 * their names back one step at a time. Words a man carries with no line
 * under them read as text only, and a call's name a release before ADR 0064
 * left standing over an empty field goes with the next Clear. The roster
 * after each is the run's artifact.
 */

const inspector = (page: Page) =>
  page.getByRole("complementary", { name: "Play inspector" });
const count = (page: Page) => inspector(page).locator(".assignments-count");
const lines = (page: Page) => page.locator("[data-scene-path-group]");

/** Every roster row as the screen reader says it, top to bottom. */
const rowNames = (page: Page) =>
  inspector(page)
    .locator(".roster-row")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("aria-label")));

async function putOnFormation(page: Page, name: string): Promise<void> {
  await page.getByTitle("Browse formations — ⇧⌘F").click();
  const browser = page.getByRole("dialog", { name: "Formations" });
  await browser.getByRole("textbox", { name: "Search formations" }).fill(name);
  await browser.getByText(name, { exact: true }).click();
  await expect(browser).toBeHidden();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
}

/** Picks a concept or a line call from the inspector's catalogue. */
async function call(
  page: Page,
  group: "Concept" | "Line call",
  name: string,
): Promise<void> {
  await inspector(page)
    .getByRole("button", { name: new RegExp(`${group} ›`) })
    .click();
  const picker = page.getByRole("dialog", { name: "Concepts and line calls" });
  await picker
    .getByRole("button", { name: new RegExp(`^${name} ${group}`) })
    .first()
    .click();
  await expect(picker).toBeHidden();
}

const clearEveryLine = (page: Page) =>
  page.getByRole("button", { name: "Clear every line" }).click();

test("takes a concept's names off with its routes, and says so", async ({
  page,
}, testInfo) => {
  await openBlankEditor(page);
  await putOnFormation(page, "I-Form Right");
  await call(page, "Concept", "Dagger");
  await expect(count(page)).toHaveText("5 of 11");
  const named = await rowNames(page);
  expect(named.filter((row) => !/: No \w+ yet/.test(row!))).toHaveLength(5);

  // The routes and their names go together; the toast counts both.
  await clearEveryLine(page);
  await expect(lines(page)).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    "Clear every line — 5 lines, 5 names off",
  );
  await expect(count(page)).toHaveText("0 of 11");
  const cleared = await rowNames(page);
  expect(cleared.filter((row) => /: No \w+ yet — /.test(row!))).toHaveLength(
    11,
  );
  for (const word of ["DIG", "SEAM", "FLAT", "GO", "CHECK"]) {
    expect(cleared.join("\n")).not.toContain(`: ${word}`);
  }

  // The line call counts the five it drew and nobody else.
  await call(page, "Line call", "Drive");
  await expect(count(page)).toHaveText("5 of 11");
  const blocked = await rowNames(page);
  expect(blocked.filter((row) => /: Drive — /.test(row!))).toHaveLength(5);
  expect(blocked.filter((row) => /: No route yet — /.test(row!))).toHaveLength(
    6,
  );

  // Undo the call, then the clear: each one step, names back with the lines.
  await page.getByTitle("Undo Applied Drive").click();
  await expect(count(page)).toHaveText("0 of 11");
  await page.getByTitle("Undo Clear every line").click();
  await expect(count(page)).toHaveText("5 of 11");
  await expect(lines(page)).toHaveCount(5);
  expect(await rowNames(page)).toEqual(named);

  // The toast times out, so the artifact is the same on every run.
  await expect(page.locator(".toast")).toHaveCount(0, { timeout: 8_000 });
  await page.screenshot({ path: testInfo.outputPath("dagger-restored.png") });
});

test("takes a defense's drops and blitzes the same way", async ({
  page,
}, testInfo) => {
  await openBlankEditor(page);
  await page.getByRole("button", { name: "More actions" }).click();
  await page
    .locator(".more-panel")
    .getByRole("button", { name: /^New defensive play/ })
    .click();
  await page.keyboard.press("Control+Shift+d");
  const browser = page.getByRole("dialog", { name: "Defenses" });
  await expect(browser).toBeVisible();
  const withLines = browser.getByRole("button", { name: "With assignments" });
  if ((await withLines.getAttribute("aria-pressed")) !== "true") {
    await withLines.click();
  }
  await browser
    .getByRole("textbox", { name: "Search defenses" })
    .fill("4-3 Cover 3");
  await browser.getByText("4-3 Cover 3", { exact: true }).click();
  await expect(browser).toBeHidden();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await expect(count(page)).toHaveText("11 of 11");
  const called = await rowNames(page);

  // A defender's call is his line, with no name apart from it to take.
  await clearEveryLine(page);
  await expect(lines(page)).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    "Clear every line — 11 lines off",
  );
  await expect(page.getByRole("status")).not.toContainText("names");
  await expect(count(page)).toHaveText("0 of 11");
  expect(
    (await rowNames(page)).filter((row) => /: No assignment yet — /.test(row!)),
  ).toHaveLength(11);

  await page.getByTitle("Undo Clear every line").click();
  await expect(count(page)).toHaveText("11 of 11");
  expect(await rowNames(page)).toEqual(called);

  await expect(page.locator(".toast")).toHaveCount(0, { timeout: 8_000 });
  await page.screenshot({ path: testInfo.outputPath("cover-3-restored.png") });
});

/**
 * Rewrites the stored Stick — Thunder the way another release or device may
 * have left it, with its hash kept true so the device opens it as its own.
 */
async function storedAs(
  page: Page,
  edit: (document: PlayDocument) => PlayDocument,
): Promise<void> {
  const stored = await page.evaluate(
    (id) =>
      new Promise<{ document: PlayDocument }>((resolve, reject) => {
        const open = indexedDB.open("chalk-production-beta");
        open.onerror = () =>
          reject(open.error ?? new Error("The database did not open"));
        open.onsuccess = () => {
          const database = open.result;
          const request = database
            .transaction("plays", "readonly")
            .objectStore("plays")
            .get(id);
          request.onerror = () =>
            reject(request.error ?? new Error("The Play did not read"));
          request.onsuccess = () => {
            database.close();
            resolve(request.result as { document: PlayDocument });
          };
        };
      }),
    stickThunderPlay.id,
  );
  const document = edit(stored.document);
  const documentHash = await canonicalSha256(document);
  await page.evaluate(
    ({ stored, document, documentHash }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("chalk-production-beta");
        open.onerror = () =>
          reject(open.error ?? new Error("The database did not open"));
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction("plays", "readwrite");
          transaction
            .objectStore("plays")
            .put({ ...stored, document, documentHash });
          transaction.onerror = () =>
            reject(transaction.error ?? new Error("The Play did not store"));
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
        };
      }),
    { stored, document, documentHash },
  );
  await page.reload();
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible({ timeout: 30_000 });
}

test("keeps a man's own words as text only, and takes a call's name a cleared route left behind", async ({
  page,
}, testInfo) => {
  // Seeded by the URL alone: the seeded fixture wipes the database on every
  // load, and this Play has to survive the reload that opens it as stored.
  await page.goto("/?seed=starter");
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible({ timeout: 30_000 });
  // As a release before ADR 0064 stored it: X's route was cleared and its
  // DIG stayed on him; and the Coach wrote Q a word about no line at all.
  await storedAs(page, (document) => {
    const man = (letter: string) =>
      document.players.find(
        ({ label, unit }) => unit === "offense" && label === letter,
      )!.id;
    const paths = document.paths.filter(
      ({ playerId }) => playerId !== man("X"),
    );
    const kept = new Set(paths.map(({ id }) => id));
    return {
      ...document,
      paths,
      labels: document.labels.filter(
        ({ binding }) => !binding || kept.has(binding.pathId),
      ),
      assignments: [
        ...document.assignments,
        {
          id: "assignment_stale_dig",
          playerId: man("X"),
          text: "DIG",
          actions: [],
        },
        {
          id: "assignment_q_words",
          playerId: man("Q"),
          text: "Check the Mike first",
          actions: [],
        },
      ],
    };
  });

  // Both read as words with no line, and the bar counts them apart.
  const roster = inspector(page);
  await expect(
    roster.getByRole("button", { name: "X: DIG · text only — Receiver" }),
  ).toBeVisible();
  await expect(
    roster.getByRole("button", {
      name: "Q: Check the Mike first · text only — Quarterback",
    }),
  ).toBeVisible();
  await expect(count(page)).toHaveText("6 of 11 · 2 text only");

  // The call's name goes with the lines, as it would have; the Coach's
  // words stay his.
  await clearEveryLine(page);
  await expect(lines(page)).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    "Clear every line — 4 lines, 1 name off",
  );
  await expect(
    roster.getByRole("button", { name: "X: No route yet — Receiver" }),
  ).toBeVisible();
  await expect(
    roster.getByRole("button", {
      name: "Q: Check the Mike first · text only — Quarterback",
    }),
  ).toBeVisible();
  await expect(count(page)).toHaveText("1 of 11 · 1 text only");
  await expect(page.locator(".toast")).toHaveCount(0, { timeout: 8_000 });
  await page.screenshot({ path: testInfo.outputPath("text-only-words.png") });

  // One undo brings the lines back, and the name that went with them.
  await page.getByTitle("Undo Clear every line").click();
  await expect(lines(page)).toHaveCount(4);
  await expect(count(page)).toHaveText("6 of 11 · 2 text only");
});
