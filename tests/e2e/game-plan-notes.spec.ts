import { writeFile } from "node:fs/promises";

import type { Locator, Page } from "@playwright/test";

import { expect, openGamePlans, openViewAndLibrary, test } from "./fixtures";

/**
 * Issue #155: a matchup note typed into a call, and the number typed beside
 * it, are the Coach's the moment he types them — whether or not he leaves
 * the field before he moves the call, prepares, or walks away from the
 * plan. The prepared call sheet carries the complete latest note.
 */
const NOTE_ONE = "vs 2-high: Y sits, Z runs it off";
const NOTE_TWO = "Cover 3 check: bend the seams";
const NOTE_THREE = "Wheel the back on a blitz look";
const HEADER_NOTE = "Central Catholic";

async function openWorkspace(page: Page): Promise<Locator> {
  await expect(
    page.getByRole("button", { name: "View & library" }),
  ).toBeVisible();
  const workspace = await openGamePlans(page);
  await expect(workspace).toBeVisible();
  return workspace;
}

const rowOf = (section: Locator, name: string) =>
  section.locator("[data-call-id]").filter({ hasText: name });

test("keeps a note typed a moment before the call moves, prepares or the plan closes", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const workspace = await openWorkspace(page);
  await workspace.getByRole("button", { name: "New plan" }).click();
  await workspace.getByLabel("Plan name").fill("Week 3");
  await workspace.getByLabel("Opponent").fill("Central");
  await workspace.getByRole("button", { name: "Create plan" }).click();
  await workspace.getByRole("checkbox", { name: /^Stick — Thunder$/ }).check();
  await workspace.getByRole("checkbox", { name: /^Four Verticals/ }).check();
  await workspace.getByRole("button", { name: /^Add 2 to plan/ }).click();
  const openers = workspace.getByRole("region", { name: "Openers" });
  const redZone = workspace.getByRole("region", { name: "Red zone" });
  await expect(openers.locator("[data-call-id]")).toHaveCount(2);

  // A note still focused when the call is sent to another section by the
  // menu — no blur in between — arrives with the call.
  const stickNote = rowOf(openers, "Stick — Thunder").getByLabel("Call note");
  await stickNote.fill(NOTE_ONE);
  await expect(stickNote).toBeFocused();
  await rowOf(openers, "Stick — Thunder")
    .getByLabel("Move Stick — Thunder to section")
    .selectOption({ label: "Red zone" });
  const stick = rowOf(redZone, "Stick — Thunder");
  await expect(stick).toHaveCount(1);
  await expect(stick.getByLabel("Call note")).toHaveValue(NOTE_ONE);
  await expect(openers.locator("[data-call-id]")).toHaveCount(1);

  // A number typed and left in the field when the call is moved goes with it.
  const stickCode = stick.getByLabel("Call number for Stick — Thunder");
  await stickCode.fill("12");
  await expect(stickCode).toBeFocused();
  await stick
    .getByLabel("Move Stick — Thunder to section")
    .selectOption({ label: "Openers" });
  await expect(
    rowOf(openers, "Stick — Thunder").getByLabel(
      "Call number for Stick — Thunder",
    ),
  ).toHaveValue("12");
  await expect(
    rowOf(openers, "Stick — Thunder").getByLabel("Call note"),
  ).toHaveValue(NOTE_ONE);

  // A note still focused when the call is dragged to another section goes
  // with the call, and lands where it was dropped.
  const vertsNote = rowOf(openers, "Four Verticals").getByLabel("Call note");
  await vertsNote.fill(NOTE_TWO);
  await expect(vertsNote).toBeFocused();
  await rowOf(openers, "Four Verticals")
    .locator(".game-plan-grip")
    .dragTo(redZone.locator(".game-plan-section-head"));
  const verts = rowOf(redZone, "Four Verticals");
  await expect(verts).toHaveCount(1);
  await expect(verts.getByLabel("Call note")).toHaveValue(NOTE_TWO);
  await expect(openers.locator("[data-call-id]")).toHaveCount(1);

  // The last words typed into a note, with Prepare clicked straight after,
  // are in the packet.
  const vertsCode = verts.getByLabel("Call number for Four Verticals");
  await vertsCode.fill("7");
  await vertsCode.press("Enter");
  await verts.getByLabel("Call note").fill(`${NOTE_TWO} — ${NOTE_THREE}`);
  await expect(verts.getByLabel("Call note")).toBeFocused();
  await workspace.getByRole("button", { name: "Prepare for game" }).click();
  await expect(workspace.getByText(/^Prepared 2 calls/)).toBeVisible();
  await expect(verts.getByLabel("Call note")).toHaveValue(
    `${NOTE_TWO} — ${NOTE_THREE}`,
  );

  const popup = page.waitForEvent("popup");
  await workspace.getByRole("button", { name: "Call sheet" }).click();
  const sheet = await popup;
  await expect(sheet.locator("body")).toContainText("Week 3");
  await expect(sheet.locator("body")).toContainText(NOTE_ONE);
  await expect(sheet.locator("body")).toContainText(
    `${NOTE_TWO} — ${NOTE_THREE}`,
  );
  // The sheet as printed, kept beside the run for anyone to open.
  await writeFile(
    testInfo.outputPath("call-sheet.html"),
    await sheet.content(),
    "utf8",
  );
  await sheet.close();

  // The opponent typed into the head, with the plan closed straight after
  // by its Back button, is on the plan when it opens again.
  const opponent = workspace.getByLabel("Opponent");
  await opponent.fill(HEADER_NOTE);
  await expect(opponent).toBeFocused();
  await workspace.getByRole("button", { name: "Back to game plans" }).click();
  await expect(
    workspace.getByRole("button", { name: /^Week 3 /, exact: false }),
  ).toContainText(`vs ${HEADER_NOTE}`);
  await workspace
    .getByRole("button", { name: /^Week 3 /, exact: false })
    .click();
  await expect(workspace.getByLabel("Opponent")).toHaveValue(HEADER_NOTE);

  // In the dialog off the Playbook browser, Escape closes the workspace
  // over a note still being typed — no field is left first. The note is on
  // the plan when it opens again.
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Editor", exact: true })
    .click();
  await openViewAndLibrary(page);
  const library = page
    .getByRole("navigation", { name: "Sidebar" })
    .getByRole("button", { name: /^Library/ });
  await expect(library).toBeVisible();
  if ((await library.getAttribute("aria-expanded")) === "false") {
    await library.click();
  }
  const book = page.getByRole("dialog", { name: "Playbook" });
  const dialog = page.getByRole("dialog", { name: "Game plans" });
  const openDialog = async () => {
    await page.getByRole("button", { name: "Browse Playbook" }).click();
    await book.getByRole("button", { name: "Game plans" }).click();
    await dialog
      .getByRole("button", { name: /^Week 3 /, exact: false })
      .click();
    return rowOf(
      dialog.getByRole("region", { name: "Openers" }),
      "Stick — Thunder",
    );
  };
  const stickAgain = await openDialog();
  await stickAgain.getByLabel("Call note").fill(`${NOTE_ONE} — late`);
  await expect(stickAgain.getByLabel("Call note")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect((await openDialog()).getByLabel("Call note")).toHaveValue(
    `${NOTE_ONE} — late`,
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // Everything above survives a reload — it was written, not just shown.
  await page.reload();
  const reloaded = await openWorkspace(page);
  await reloaded
    .getByRole("button", { name: /^Week 3 /, exact: false })
    .click();
  const openersAgain = reloaded.getByRole("region", { name: "Openers" });
  const redZoneAgain = reloaded.getByRole("region", { name: "Red zone" });
  await expect(
    rowOf(openersAgain, "Stick — Thunder").getByLabel("Call note"),
  ).toHaveValue(`${NOTE_ONE} — late`);
  await expect(
    rowOf(openersAgain, "Stick — Thunder").getByLabel(
      "Call number for Stick — Thunder",
    ),
  ).toHaveValue("12");
  await expect(
    rowOf(redZoneAgain, "Four Verticals").getByLabel("Call note"),
  ).toHaveValue(`${NOTE_TWO} — ${NOTE_THREE}`);
  await expect(reloaded.getByLabel("Opponent")).toHaveValue(HEADER_NOTE);
  await page.screenshot({
    path: testInfo.outputPath("game-plan-notes.png"),
    fullPage: false,
  });
});
