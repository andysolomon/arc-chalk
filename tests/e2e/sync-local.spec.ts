import { expect, test } from "./fixtures";

test("persists a new play with Gun Doubles Right and Mesh after reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  // The labeled header button (issue #65); the More menu carries one too.
  await page.getByRole("banner").locator("button.new-play").click();
  const name = page.getByRole("textbox", { name: "Play name" });
  await name.fill("QA formation and Mesh");
  await name.press("Enter");
  await page.getByTitle("Browse formations — ⇧⌘F").click();
  await page
    .getByRole("dialog", { name: "Formations" })
    .getByText("Gun Doubles Right", { exact: true })
    .click();
  // Concepts live in the searchable catalogue behind the summary row (#64).
  await page.getByRole("button", { name: /Concept ›/ }).click();
  await page
    .getByRole("dialog", { name: "Concepts and line calls" })
    .getByRole("button", { name: /^Mesh/ })
    .first()
    .click();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await expect(page.locator("[data-scene-path]")).toHaveCount(5);
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Library/ }).click();
  await page.getByRole("button", { name: "Browse Playbook" }).click();
  const book = page.getByRole("dialog", { name: "Playbook" });
  await book.getByLabel("Search plays").fill("QA formation and Mesh");
  await book.getByText("QA formation and Mesh", { exact: true }).click();
  await expect(name).toHaveValue("QA formation and Mesh");
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await expect(page.locator("[data-scene-path]")).toHaveCount(5);
});

test("keeps local save and Account available without Clerk or Convex", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible();
  await expect(page.locator("[data-sync-status]")).toHaveAttribute(
    "data-sync-status",
    "local",
  );

  const playName = page.getByRole("textbox", { name: "Play name" });
  await playName.fill("Local-only save");
  await playName.press("Enter");
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Local-only save football play" }),
  ).toBeVisible();

  await page.getByTitle("More actions").click();
  await page.getByRole("button", { name: "Account" }).click();
  await expect(
    page.getByText(
      "Cloud sign-in is not configured. Editing on this device still works.",
    ),
  ).toBeVisible();
});
