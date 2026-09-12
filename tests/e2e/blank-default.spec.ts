import { expect, test } from "@playwright/test";
import { openBlankEditor } from "./fixtures";

const storedCounts = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () =>
      new Promise<{ playbooks: number; plays: number }>((resolve) => {
        const open = indexedDB.open("chalk-production-beta");
        open.onerror = () => resolve({ playbooks: 0, plays: 0 });
        open.onsuccess = () => {
          const database = open.result;
          if (
            !database.objectStoreNames.contains("playbooks") ||
            !database.objectStoreNames.contains("plays")
          ) {
            database.close();
            resolve({ playbooks: 0, plays: 0 });
            return;
          }
          const tx = database.transaction(["playbooks", "plays"], "readonly");
          const playbooks = tx.objectStore("playbooks").count();
          const plays = tx.objectStore("plays").count();
          const result = { playbooks: 0, plays: 0 };
          playbooks.onsuccess = () => {
            result.playbooks = playbooks.result;
          };
          plays.onsuccess = () => {
            result.plays = plays.result;
          };
          tx.oncomplete = () => {
            database.close();
            resolve(result);
          };
          tx.onerror = () => {
            database.close();
            resolve({ playbooks: 0, plays: 0 });
          };
        };
      }),
  );

test("opens a blank canvas with no starter Plays or Playbooks", async ({
  page,
}) => {
  await openBlankEditor(page);

  await expect(page).toHaveTitle("Chalk");
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Untitled play",
  );
  await expect(
    page.getByRole("img", { name: "Untitled play football play" }),
  ).toBeVisible();
  await expect(page.locator("[data-scene-player]")).toHaveCount(0);
  await expect(page.locator("[data-scene-path]")).toHaveCount(0);
  await expect(page.locator("[data-scene-label]")).toHaveCount(0);
  await expect(page.getByText("Stick — Thunder")).toHaveCount(0);
  await expect(page.getByText("Chalk Starter Playbook")).toHaveCount(0);

  await expect
    .poll(async () => storedCounts(page))
    .toEqual({
      playbooks: 0,
      plays: 0,
    });
});
