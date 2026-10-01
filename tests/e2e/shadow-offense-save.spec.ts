import { expect, type Page, type TestInfo, test } from "@playwright/test";

import { startNewPlay } from "./fixtures";

/**
 * A defensive play drawn against a shadow offense (issue #152). The play
 * remembers the set its shadow stands in the way an offensive play
 * remembers its shadow's call (ADR 0072), so a Coach who puts Gun Doubles
 * Right under Nickel Cover 1 sees the call match its men to receivers,
 * saves, and gets all of it back after a reload. And while a write is
 * failing, the status says what that means in a coach's words and the
 * browser asks before the tab is left. The field, and the failing status,
 * are the run's artifacts.
 */

const DATABASE = "chalk-production-beta";

/** A fresh context is an unseeded device; nothing here wipes it on reload. */
async function openUntitledPlay(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Untitled play",
    { timeout: 30_000 },
  );
}

/** A new defensive play, empty until a call is put on. */
async function newDefensivePlay(page: Page): Promise<void> {
  await startNewPlay(page, "defensive");
  await expect(page.locator("[data-scene-player]")).toHaveCount(0);
}

/** Puts a call on with its own lines. */
async function putOnDefense(page: Page, name: string): Promise<void> {
  await page.keyboard.press("Control+Shift+d");
  const browser = page.getByRole("dialog", { name: "Defenses" });
  await expect(browser).toBeVisible();
  const toggle = browser.getByRole("button", { name: "With assignments" });
  if ((await toggle.getAttribute("aria-pressed")) !== "true") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await browser.getByRole("textbox", { name: "Search defenses" }).fill(name);
  await browser.getByText(name, { exact: true }).click();
  await expect(browser).toBeHidden();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
}

/** Puts a set on the field — on a defensive play, the shadow offense. */
async function putOnOffense(page: Page, name: string): Promise<void> {
  await page.keyboard.press("Control+Shift+f");
  const browser = page.getByRole("dialog", { name: "Formations" });
  await expect(browser).toBeVisible();
  await browser.getByText(name, { exact: true }).click();
  await expect(browser).toBeHidden();
  await expect(page.locator("[data-scene-player]")).toHaveCount(22);
}

/** Every man call on the field, as the field names it: "C man on Z". */
async function manCalls(page: Page): Promise<string[]> {
  const labels = await page
    .locator('[data-scene-path-group][aria-label*=" man"]')
    .evaluateAll((groups) =>
      groups.map((group) => group.getAttribute("aria-label") ?? ""),
    );
  return labels.sort();
}

/** The field as drawn, saved beside the run's results. */
async function saveField(page: Page, info: TestInfo, name: string) {
  await page
    .locator("svg.field-diagram")
    .first()
    .screenshot({ path: info.outputPath(`${name}.png`) });
}

/**
 * Restamps the one stored Play with `documentHash`, as another writer on
 * the device would, and hands back the hash it carried. A commit from this
 * editor is guarded by the hash it last wrote, so a restamped record refuses
 * the next write rather than letting it overwrite work it has not seen.
 */
function restampStoredPlay(page: Page, documentHash: string): Promise<string> {
  return page.evaluate(
    ({ database, documentHash }) =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open(database);
        open.onerror = () =>
          reject(
            new Error(open.error?.message ?? "Could not open the device."),
          );
        open.onsuccess = () => {
          const connection = open.result;
          const tx = connection.transaction("plays", "readwrite");
          const plays = tx.objectStore("plays");
          const all = plays.getAll();
          all.onsuccess = () => {
            const [record] = all.result as { documentHash: string }[];
            if (!record) {
              reject(new Error("No stored Play to restamp."));
              return;
            }
            const was = record.documentHash;
            plays.put({ ...record, documentHash });
            tx.oncomplete = () => {
              connection.close();
              resolve(was);
            };
          };
          tx.onerror = () =>
            reject(
              new Error(tx.error?.message ?? "Could not restamp the Play."),
            );
        };
      }),
    { database: DATABASE, documentHash },
  );
}

/** Whether leaving the page would be questioned first. */
function leavingIsQuestioned(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      !window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
  );
}

test("keeps a defensive play's shadow offense through a save and a reload", async ({
  page,
}, testInfo) => {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(message.text());
  });
  await openUntitledPlay(page);
  await newDefensivePlay(page);
  await putOnDefense(page, "Nickel Cover 1");
  // The offense here is the look to draw the call against, not the play.
  await putOnOffense(page, "Gun Doubles Right");

  // With receivers on the field, each man in man has one to take: the
  // corners the wide men, the nickel the slot, the safety the tight end, a
  // backer the back — and the other backer, with nobody left, free.
  const matched = [
    "$ man on Y",
    "C man on X",
    "C man on Z",
    "M man on F",
    "N man on H",
    "W man",
  ];
  await expect.poll(() => manCalls(page)).toEqual(matched);

  const name = page.getByRole("textbox", { name: "Play name" });
  await name.fill("Nickel Cover 1 vs Doubles");
  await name.press("Enter");
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();
  expect(failures).toEqual([]);

  // The sidebar reads the shadow as the set it is in, and once the play
  // remembers that set it offers to put the men back in it.
  const shadow = page
    .getByRole("navigation", { name: "Sidebar" })
    .getByRole("button", { name: /^Shadow offense/ });
  await expect(shadow).toContainText("Gun Doubles Right");
  await shadow.click();
  await expect(
    page.getByRole("button", { name: "Reset offense to Gun Doubles Right" }),
  ).toBeVisible();

  await page.reload();
  await expect(name).toHaveValue("Nickel Cover 1 vs Doubles", {
    timeout: 30_000,
  });
  await expect(page.locator("[data-scene-player]")).toHaveCount(22);
  await expect.poll(() => manCalls(page)).toEqual(matched);
  await expect(shadow).toContainText("Gun Doubles Right");
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();
  await saveField(page, testInfo, "nickel-cover-1-vs-gun-doubles-right");
});

test("asks before the tab is left while a save is failing, and says why in a coach's words", async ({
  page,
}, testInfo) => {
  await openUntitledPlay(page);
  const name = page.getByRole("textbox", { name: "Play name" });
  await name.fill("Guarded draft");
  await name.press("Enter");
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();
  expect(await leavingIsQuestioned(page)).toBe(false);

  // The next write is refused, and the status says what that means.
  const written = await restampStoredPlay(page, "another-writer");
  await name.fill("Guarded draft — edited");
  await name.press("Enter");
  const status = page.getByRole("button", {
    name: "Local save failed — retry",
  });
  await expect(status).toBeVisible();
  await expect(status).toHaveAttribute("title", /only on this screen/);
  await expect(status).toHaveAttribute("title", /stay on the page/);
  await expect(status).not.toHaveAttribute("title", /"path"/);
  expect(await leavingIsQuestioned(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("save-failing.png") });

  // The record as it was, and the retry lands; nothing stands in the way
  // of leaving any more, and the edit survives the reload.
  await restampStoredPlay(page, written);
  await status.click();
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();
  expect(await leavingIsQuestioned(page)).toBe(false);

  await page.reload();
  await expect(name).toHaveValue("Guarded draft — edited", {
    timeout: 30_000,
  });
});
