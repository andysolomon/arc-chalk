import { writeFile } from "node:fs/promises";

import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Issue #155 on a phone: the game-plan fields are the same ones, and a thumb
 * goes from the note straight to the section menu. The note and the number
 * typed go with the call, into the packet, and are there after a reload.
 */
const NOTE = "vs 2-high: Y sits, Z runs it off";
const MORE = "check the corner's leverage";

async function openGamePlans(page: Page): Promise<Locator> {
  await expect(page.locator("header.topbar.phone-topbar")).toBeVisible();
  const workspace = page.getByRole("region", { name: "Game plans" });
  if ((await workspace.count()) === 0) {
    await page
      .getByRole("navigation", { name: "Workspace views" })
      .getByRole("button", { name: "Playbooks", exact: true })
      .tap();
    await page
      .getByRole("navigation", { name: "Book pages" })
      .getByRole("button", { name: "Game plans", exact: true })
      .tap();
  }
  await expect(workspace).toBeVisible();
  return workspace;
}

const rowOf = (section: Locator, name: string) =>
  section.locator("[data-call-id]").filter({ hasText: name });

test.describe("game-plan notes on a phone", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });

  test("keeps a note typed a moment before the call moves or the plan is prepared", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    const workspace = await openGamePlans(page);
    await workspace.getByRole("button", { name: "New plan" }).tap();
    await workspace.getByLabel("Plan name").fill("Week 3");
    await workspace.getByRole("button", { name: "Create plan" }).tap();
    await workspace
      .getByRole("checkbox", { name: /^Stick — Thunder$/ })
      .check();
    await workspace.getByRole("checkbox", { name: /^Four Verticals/ }).check();
    await workspace.getByRole("button", { name: /^Add 2 to plan/ }).tap();
    const openers = workspace.getByRole("region", { name: "Openers" });
    const redZone = workspace.getByRole("region", { name: "Red zone" });
    await expect(openers.locator("[data-call-id]")).toHaveCount(2);

    // A note still focused when the call is sent to another section goes
    // with the call.
    const note = rowOf(openers, "Stick — Thunder").getByLabel("Call note");
    await note.fill(NOTE);
    await expect(note).toBeFocused();
    await rowOf(openers, "Stick — Thunder")
      .getByLabel("Move Stick — Thunder to section")
      .selectOption({ label: "Red zone" });
    const stick = rowOf(redZone, "Stick — Thunder");
    await expect(stick).toHaveCount(1);
    await expect(stick.getByLabel("Call note")).toHaveValue(NOTE);

    // So does a number still focused.
    const code = stick.getByLabel("Call number for Stick — Thunder");
    await code.fill("12");
    await expect(code).toBeFocused();
    await stick
      .getByLabel("Move Stick — Thunder to section")
      .selectOption({ label: "Openers" });
    const back = rowOf(openers, "Stick — Thunder");
    await expect(
      back.getByLabel("Call number for Stick — Thunder"),
    ).toHaveValue("12");
    await expect(back.getByLabel("Call note")).toHaveValue(NOTE);

    // The last words typed, with Prepare tapped straight after, are in the
    // packet.
    await back.getByLabel("Call note").fill(`${NOTE} — ${MORE}`);
    await expect(back.getByLabel("Call note")).toBeFocused();
    await workspace.getByRole("button", { name: "Prepare for game" }).tap();
    await expect(workspace.getByText(/^Prepared 2 calls/)).toBeVisible();
    const popup = page.waitForEvent("popup");
    await workspace.getByRole("button", { name: "Call sheet" }).tap();
    const sheet = await popup;
    await expect(sheet.locator("body")).toContainText(`${NOTE} — ${MORE}`);
    // The sheet as printed, kept beside the run for anyone to open.
    await writeFile(
      testInfo.outputPath("call-sheet.html"),
      await sheet.content(),
      "utf8",
    );
    await sheet.close();

    // Written, not just shown.
    await page.reload();
    const again = await openGamePlans(page);
    await again.getByRole("button", { name: /^Week 3 /, exact: false }).tap();
    const row = rowOf(
      again.getByRole("region", { name: "Openers" }),
      "Stick — Thunder",
    );
    await expect(row.getByLabel("Call note")).toHaveValue(`${NOTE} — ${MORE}`);
    await expect(row.getByLabel("Call number for Stick — Thunder")).toHaveValue(
      "12",
    );
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath("phone-plan-notes.png"),
      fullPage: false,
    });
  });
});
