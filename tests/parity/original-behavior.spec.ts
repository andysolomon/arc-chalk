import { expect, test } from "@playwright/test";

import {
  clickFieldPoint,
  clickPlayerByLetter,
  loadCanonicalPrototype,
  prototypeStorage,
} from "./prototype-harness";

const parseStored = async <T>(
  page: import("@playwright/test").Page,
  key: string,
) => {
  const raw = await prototypeStorage(page, key);
  expect(raw, `${key} should be written`).toBeTruthy();
  return JSON.parse(raw!) as T;
};

test.describe("canonical prototype happy paths", () => {
  test("seeds Stick — Thunder as the working Play", async ({ page }) => {
    await loadCanonicalPrototype(page);
    await expect(page.locator('input[value="Stick — Thunder"]')).toBeVisible();
    const current = await parseStored<{ playName: string }>(
      page,
      "fpd.current.v1",
    );
    expect(current.playName).toBe("Stick — Thunder");
  });

  test("undo restores a deleted Player", async ({ page }) => {
    await loadCanonicalPrototype(page);
    await clickPlayerByLetter(page, "Q");
    await expect(page.getByPlaceholder("Letter — X, Y, Z, Q…")).toBeVisible();
    await page.keyboard.press("Backspace");
    await expect(page.locator("svg text", { hasText: /^Q$/ })).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await expect(
      page.locator("svg text", { hasText: /^Q$/ }).first(),
    ).toBeVisible();
  });

  test("the Formation browser lists shotgun sets", async ({ page }) => {
    await loadCanonicalPrototype(page);
    await page.getByTitle("Browse formations — ⇧⌘F").click();
    await expect(
      page.getByPlaceholder("Search — gun, trips, empty, 12…"),
    ).toBeVisible();
    await expect(page.getByText("Gun Doubles Right").first()).toBeVisible();
  });

  test("Present then Escape returns to the editor", async ({ page }) => {
    await loadCanonicalPrototype(page);
    await page.getByRole("button", { name: "Present", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "esc", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTitle("Browse formations — ⇧⌘F")).toBeVisible();
    await expect(page.locator('input[value="Stick — Thunder"]')).toBeVisible();
  });

  test("writes the working-document persistence keys on first load", async ({
    page,
  }) => {
    await loadCanonicalPrototype(page);
    const keys = await page.evaluate(() => Object.keys(localStorage).sort());
    expect(keys).toEqual(
      expect.arrayContaining([
        "fpd.current.v1",
        "fpd.plays.v1",
        "fpd.examples.v15",
      ]),
    );
    const current = await parseStored<{ doc: { players: unknown[] } }>(
      page,
      "fpd.current.v1",
    );
    expect(current.doc.players.length).toBeGreaterThan(0);
  });
});

test.describe("canonical prototype documented defects", () => {
  test("B1: opening a demo into the editor keeps the previous Play's id", async ({
    page,
  }) => {
    await loadCanonicalPrototype(page);
    await page
      .getByRole("button", { name: "Demo", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.getByRole("button", { name: "Defense", exact: true }).click();
    await expect(page.getByText("Offense in gray")).toBeVisible();
    await page
      .getByRole("button", { name: "Open this play in the editor" })
      .click();

    await expect(
      page.locator('input[value="Cover 3 — Fire Zone"]'),
    ).toBeVisible();

    const current = await parseStored<{
      playName: string;
      curPlayId: string | null;
    }>(page, "fpd.current.v1");
    expect(current.playName).toBe("Cover 3 — Fire Zone");
    expect(current.curPlayId).toBeTruthy();

    const plays = await parseStored<Array<{ id: string; name: string }>>(
      page,
      "fpd.plays.v1",
    );
    const bound = plays.find((play) => play.id === current.curPlayId);
    expect(bound?.name).toBe("Stick — Thunder");
  });

  test("finding 7: digit 1 with a selected route does not set read order", async ({
    page,
  }) => {
    await loadCanonicalPrototype(page);
    await clickFieldPoint(page, 308, 416);
    await expect(page.getByText("Coaching", { exact: true })).toBeVisible();
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    const read = page
      .getByText("Read", { exact: true })
      .locator("..")
      .locator("input");
    await expect(read).toHaveValue("");
    await page.keyboard.press("1");
    await expect(page.getByText("Coaching", { exact: true })).toBeVisible();
    await expect(read).toHaveValue("");
  });
});
