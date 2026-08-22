import { expect, test } from "@playwright/test";

const LOCAL_SAVE_BUDGET_MS = 50;

/**
 * The 50 ms budget is a Coach-device guarantee, and plan item 4.6 owns proving
 * it on the target devices. Shared CI runners are several times slower than any
 * supported device, so there they guard against gross regressions instead.
 */
const acknowledgementCeilingMs = process.env.CI ? 400 : LOCAL_SAVE_BUDGET_MS;

const cameraOf = async (page: import("@playwright/test").Page) => {
  const viewBox = await page
    .locator("svg.field-diagram")
    .getAttribute("viewBox");
  const [x, y, width, height] = (viewBox ?? "").split(" ").map(Number);
  return { x, y, width, height };
};

/**
 * What the device really has under a preference key. A star is written
 * without blocking the Coach, so a test that reloads must wait for the write
 * rather than for a moment — and waiting on the record is also the proof that
 * the star was kept on the device at all.
 */
const storedIds = (page: import("@playwright/test").Page, key: string) =>
  page.evaluate(
    (preferenceKey) =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open("chalk-production-beta");
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const database = open.result;
          const request = database
            .transaction("preferences", "readonly")
            .objectStore("preferences")
            .get(preferenceKey);
          const finish = (ids: string[]) => {
            database.close();
            resolve(ids);
          };
          request.onerror = () => finish([]);
          request.onsuccess = () => {
            const record = request.result as { value?: string[] } | undefined;
            finish(record?.value ?? []);
          };
        };
      }),
    key,
  );

test("opens the original field-first editor shell and its modes", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Chalk");
  await expect(
    page.getByRole("navigation", { name: "Workspace views" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await expect(page.locator("[data-scene-path]")).toHaveCount(6);
  await expect(page.locator("[data-scene-label]")).toHaveCount(12);
  await expect(page.locator("[data-field-yard-line]")).toHaveCount(9);
  await expect(page.locator("[data-field-sideline]")).toHaveCount(2);
  await expect(page.locator("[data-field-minor-mark]")).toHaveCount(128);
  await expect(page.locator("[data-field-number]")).toHaveCount(8);
  await expect(
    page.getByRole("complementary", { name: "Play inspector" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Present" }).click();
  const present = page.getByRole("region", { name: "Present" });
  await expect(present).toBeVisible();
  await expect(present.getByText("Stick — Thunder")).toBeVisible();
  await expect(present.getByText("← → variations")).toBeVisible();
  await expect(page.getByRole("button", { name: "esc" })).toBeVisible();

  await page.getByRole("button", { name: "esc" }).click();
  await expect(
    page.getByRole("navigation", { name: "Drawing tools" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Demo", exact: true }).click();
  const demo = page.getByRole("region", { name: "Demo" });
  await expect(demo).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(demo.getByText("Player tool")).toBeVisible();
  await expect(page.getByText("Drawing tools — guided tour")).toBeVisible();
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Drawing tools" }),
  ).toBeVisible();

  const playName = page.getByRole("textbox", { name: "Play name" });
  const localSave = page.getByRole("button", {
    name: "Saved on this device",
  });

  // The first save of a session also pays for module evaluation, opening
  // IndexedDB, and seeding the starter Playbook. The budget describes ongoing
  // editing, so warm up first and measure the save after that.
  await playName.fill("Warm-up save");
  await playName.press("Enter");
  await expect(localSave).toBeVisible();

  await playName.fill("Mesh — Alert");
  await playName.press("Enter");
  // The renamed Play paints when its commit starts, so waiting for it and then
  // for Saved reads this save's acknowledgement rather than the warm-up's.
  await expect(
    page.getByRole("img", { name: "Mesh — Alert football play" }),
  ).toBeVisible();
  await expect(localSave).toBeVisible();

  const durationMs = Number(
    await localSave.getAttribute("data-save-duration-ms"),
  );
  expect(durationMs).toBeGreaterThan(0);
  // Chalk always classifies its own acknowledgement against the 50 ms budget.
  await expect(localSave).toHaveAttribute(
    "data-save-within-budget",
    String(durationMs < LOCAL_SAVE_BUDGET_MS),
  );
  expect(durationMs).toBeLessThan(acknowledgementCeilingMs);

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Mesh — Alert",
  );
  await expect(
    page.getByRole("img", { name: "Mesh — Alert football play" }),
  ).toBeVisible();
});

test("opens Print preview as the letter-landscape sheet and leaves on Escape", async ({
  page,
}) => {
  await page.goto("/");

  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Print" })
    .click();

  const sheet = page.getByRole("region", { name: "Print preview" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Stick — Thunder")).toBeVisible();
  await expect(sheet.getByText("Pass")).toBeVisible();
  await expect(
    sheet.getByText("letter landscape · half-inch margins · coach type"),
  ).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Print this" })).toBeVisible();
  await expect(page.locator(".print-diagram svg.field-diagram")).toBeVisible();
  await expect(
    page.getByText(
      "letter landscape, half-inch margins — this is what export → print produces · esc returns to the editor",
    ),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Drawing tools" }),
  ).toBeVisible();
});

test("opens a demo into a new Play and leaves the previous Play unchanged", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Stick — Thunder",
  );

  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Demo", exact: true })
    .click();
  const demo = page.getByRole("region", { name: "Demo" });
  await expect(demo).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await demo.getByRole("button", { name: "Defense" }).click();
  await expect(demo.getByText("Offense in gray")).toBeVisible();
  await demo
    .getByRole("button", { name: "Open this play in the editor" })
    .click();

  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Cover 3 — Fire Zone",
  );
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();

  const stored = await page.evaluate(
    () =>
      new Promise<Array<{ id: string; name: string }>>((resolve) => {
        const open = indexedDB.open("chalk-production-beta");
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const database = open.result;
          const request = database
            .transaction("plays", "readonly")
            .objectStore("plays")
            .getAll();
          request.onerror = () => {
            database.close();
            resolve([]);
          };
          request.onsuccess = () => {
            const rows =
              (request.result as Array<{
                id: string;
                document?: { name?: string };
              }>) ?? [];
            database.close();
            resolve(
              rows.map((row) => ({
                id: row.id,
                name: row.document?.name ?? "",
              })),
            );
          };
        };
      }),
  );

  expect(stored).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "play-8lkpvgj",
        name: "Stick — Thunder",
      }),
      expect.objectContaining({ name: "Cover 3 — Fire Zone" }),
    ]),
  );
  expect(
    stored.find((play) => play.name === "Cover 3 — Fire Zone")?.id,
  ).not.toBe("play-8lkpvgj");
});

test("changes the markings and the words from the inspector without moving the Play", async ({
  page,
}) => {
  await page.goto("/");
  const inspector = page.getByRole("complementary", { name: "Play inspector" });

  await expect(inspector.getByText("Page", { exact: true })).toBeVisible();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await expect(page.locator("[data-scene-label]")).toHaveCount(12);
  await expect(page.locator("[data-field-yard-line]")).toHaveCount(9);

  await inspector.getByRole("button", { name: "Half field" }).click();
  await expect(page.locator("[data-field-yard-line]")).toHaveCount(7);
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);

  await inspector.getByRole("button", { name: "Blank" }).click();
  await expect(page.locator("[data-field-yard-line]")).toHaveCount(0);
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);

  await inspector.getByRole("button", { name: "Full field" }).click();
  await expect(page.locator("[data-field-yard-line]")).toHaveCount(9);

  await inspector.getByRole("button", { name: "Text" }).click();
  await expect(page.locator("[data-scene-label]")).toHaveCount(0);
  await inspector.getByRole("button", { name: "Text" }).click();
  await expect(page.locator("[data-scene-label]")).toHaveCount(12);
});

test("drives the snap rail toggle and live status-bar camera controls", async ({
  page,
}) => {
  await page.goto("/");

  const snap = page.getByRole("button", {
    name: "Angle snap 45 degrees — S",
  });
  await expect(snap).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-formation-status]")).toHaveText(
    "CUSTOM ALIGNMENT",
  );
  await expect(
    page.getByRole("button", { name: "Fit the field — 100% zoom" }),
  ).toBeVisible();

  await snap.click();
  await expect(snap).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".status-controls")).toContainText("SNAP OFF");
  await snap.focus();
  await page.keyboard.press("Enter");
  await expect(snap).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("s");
  await expect(snap).toHaveAttribute("aria-pressed", "false");

  const fit = await cameraOf(page);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect
    .poll(async () => (await cameraOf(page)).width)
    .toBeLessThan(fit.width!);
  await expect(
    page.getByRole("button", { name: "Fit the field — 125% zoom" }),
  ).toBeVisible();
  await expect(page.locator(".statusbar")).toContainText(
    "drag the grass to move the view",
  );
  await expect(page.locator(".minimap")).toHaveAttribute("data-shown", "true");
  const zoomed = await cameraOf(page);

  const fieldItem = page
    .getByRole("list", { name: "Everything on the field" })
    .getByRole("button", { name: "Q offense player" });
  await fieldItem.focus();
  await page.keyboard.press("Enter");
  await expect(fieldItem).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Fit to selection" }).click();
  await expect
    .poll(async () => (await cameraOf(page)).width)
    .toBeLessThan(zoomed.width!);
  const selection = await cameraOf(page);
  await expect(page.locator("[data-formation-status]")).toBeEmpty();

  await page.getByRole("button", { name: "Center on the ball" }).click();
  await expect.poll(async () => (await cameraOf(page)).y).not.toBe(selection.y);

  await page.keyboard.press("Escape");
  await expect(page.locator("[data-formation-status]")).toHaveText(
    "CUSTOM ALIGNMENT",
  );
  await page.getByTitle("Browse formations — ⇧⌘F").click();
  await page.getByText("Empty Right", { exact: true }).click();
  await expect(page.locator("[data-formation-status]")).toHaveText(
    "EMPTY RIGHT · 11",
  );
});

test("stars a set, keeps the offense as one of his own, and reopens both", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByTitle("Browse formations — ⇧⌘F").click();
  const book = page.getByRole("dialog", { name: "Formations" });

  await book.getByRole("tab", { name: "Favorites" }).click();
  await expect(
    book.getByText("No favorites yet — star a formation to keep it here."),
  ).toBeVisible();

  await book.getByRole("tab", { name: "Mine" }).click();
  await expect(
    book.getByText(
      "Nothing saved yet. Set an offense on the field and save it below.",
    ),
  ).toBeVisible();

  // The offense that is already on the field, kept under a name of his own.
  const name = book.getByRole("textbox", {
    name: "Save the offense on the field as",
  });
  await expect(book.getByRole("button", { name: "Save" })).toBeDisabled();
  await name.fill("Andy's Empty");
  await book.getByRole("button", { name: "Save" }).click();

  await expect(book.getByText("Andy's Empty")).toBeVisible();
  await expect(name).toHaveValue("");
  // Naming it stars it, so it is under Favorites without being starred again.
  await book.getByRole("tab", { name: "Favorites" }).click();
  await expect(book.getByText("Andy's Empty")).toBeVisible();

  // Star a set Chalk ships, so both kinds are kept.
  await book.getByRole("tab", { name: "All" }).click();
  await book.getByRole("button", { name: "Add to favorites" }).first().click();
  await page.keyboard.press("Escape");

  // A call is starred in its own book.
  await page.getByTitle("Browse defenses — ⇧⌘D").click();
  const calls = page.getByRole("dialog", { name: "Defenses" });
  await calls.getByRole("button", { name: "Add to favorites" }).first().click();
  await page.keyboard.press("Escape");

  // Everything survives closing Chalk, because it is on the device — and it
  // is on the device before the reload, which is the thing being claimed.
  await expect
    .poll(() => storedIds(page, "formations.favorites.v1"))
    .toHaveLength(2);
  await expect
    .poll(() => storedIds(page, "defenses.favorites.v1"))
    .toHaveLength(1);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Stick — Thunder",
  );

  await page.getByTitle("Browse formations — ⇧⌘F").click();
  const reopened = page.getByRole("dialog", { name: "Formations" });
  await reopened.getByRole("tab", { name: "Mine" }).click();
  await expect(reopened.getByText("Andy's Empty")).toBeVisible();
  await reopened.getByRole("tab", { name: "Favorites" }).click();
  await expect(
    reopened.getByRole("button", { name: "Remove from favorites" }),
  ).toHaveCount(2);

  // His own set can be let go again, and the letting go also lasts.
  await reopened.getByRole("tab", { name: "Mine" }).click();
  await reopened.getByRole("button", { name: "Remove Andy's Empty" }).click();
  await expect(
    reopened.getByText(
      "Nothing saved yet. Set an offense on the field and save it below.",
    ),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await page.getByTitle("Browse formations — ⇧⌘F").click();
  await page
    .getByRole("dialog", { name: "Formations" })
    .getByRole("tab", { name: "Mine" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Formations" }).getByText("Andy's Empty"),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByTitle("Browse defenses — ⇧⌘D").click();
  const reopenedCalls = page.getByRole("dialog", { name: "Defenses" });
  await reopenedCalls.getByRole("tab", { name: "Favorites" }).click();
  await expect(
    reopenedCalls.getByRole("button", { name: "Remove from favorites" }),
  ).toHaveCount(1);
});

test("reaches a saved set from the command palette and pans from the map", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByTitle("Browse formations — ⇧⌘F").click();
  const book = page.getByRole("dialog", { name: "Formations" });
  await book
    .getByRole("textbox", { name: "Save the offense on the field as" })
    .fill("Andy's Empty");
  await book.getByRole("button", { name: "Save" }).click();
  await expect(book.getByText("Andy's Empty")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette
    .getByPlaceholder("Type a command — formation, defense, export, clear…")
    .fill("andy");
  await palette
    .getByRole("button", { name: "Formation: Andy's Empty" })
    .click();
  await expect(page.locator("[data-formation-status]")).toHaveText(
    /ANDY'S EMPTY/,
  );

  const before = await cameraOf(page);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.locator(".minimap")).toHaveAttribute("data-shown", "true");
  const map = page.locator(".minimap svg");
  const box = await map.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + 8, box!.y + 8);
  await expect.poll(async () => (await cameraOf(page)).x).not.toBe(before.x);
});

test("undoes and redoes a Play edit across a reload", async ({ page }) => {
  await page.goto("/");

  const playName = page.getByRole("textbox", { name: "Play name" });
  const undo = page.getByRole("button", { name: "Undo" });
  const redo = page.getByRole("button", { name: "Redo" });

  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  await playName.fill("Mesh — Alert");
  await playName.press("Enter");
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();
  await expect(undo).toBeEnabled();
  await expect(undo).toHaveAttribute("title", "Undo Rename Play");

  await undo.click();
  await expect(playName).toHaveValue("Stick — Thunder");
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible();
  await expect(redo).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Stick — Thunder",
  );
  const redoAfterReload = page.getByRole("button", { name: "Redo" });
  await expect(redoAfterReload).toBeEnabled();
  await expect(redoAfterReload).toHaveAttribute("title", "Redo Rename Play");

  await redoAfterReload.click();
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Mesh — Alert",
  );
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Mesh — Alert",
  );
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
});

test("names a version and restores it after a reload", async ({ page }) => {
  await page.goto("/");

  const playName = page.getByRole("textbox", { name: "Play name" });
  const saved = page.getByRole("button", { name: "Saved on this device" });

  await page.getByRole("banner").getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "Snapshot" }).click();
  await page
    .getByRole("textbox", { name: "Snapshot name" })
    .fill("Install week");
  // Naming replaces the menu with the original's snapshot form, whose commit
  // button carries the same word.
  await page.getByRole("button", { name: "Snapshot" }).click();
  await expect(page.getByText("Install week")).toBeVisible();

  const inspector = page.getByRole("complementary", { name: "Play inspector" });
  await inspector.getByRole("button", { name: "Show" }).click();
  await expect(inspector.getByText("Install week")).toBeVisible();
  await expect(inspector.getByText("just now")).toBeVisible();
  await inspector.getByRole("button", { name: "Hide" }).click();

  await playName.fill("Thursday rewrite");
  await playName.press("Enter");
  await expect(
    page.getByRole("img", { name: "Thursday rewrite football play" }),
  ).toBeVisible();
  await expect(saved).toBeVisible();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Thursday rewrite",
  );

  // The named version outlived the session it was created in.
  await page.getByRole("banner").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Install week")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();

  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Stick — Thunder",
  );
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();

  // A restore is an ordinary edit, so the Coach can undo it.
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toHaveAttribute("title", "Undo Restore version");
  await undo.click();
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Thursday rewrite",
  );
});

test("opens a library variation, searches the Playbook, and restores browser scroll", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText(/^Library/)).toBeVisible();
  await expect(page.getByText("Gun Doubles Left")).toBeVisible();

  await page.getByText("Gun Doubles Left").click();
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Stick — Thunder — Gun Doubles Left",
  );

  await page.getByRole("button", { name: "Browse Playbook" }).click();
  const book = page.getByRole("dialog", { name: "Playbook" });
  await expect(book).toBeVisible();
  await book.getByLabel("Search plays").fill("red zone");
  await expect(book.getByText("Stick — Thunder — Red zone")).toBeVisible();
  await book.getByText("Stick — Thunder — Red zone").click();
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Stick — Thunder — Red zone",
  );

  await page.getByRole("button", { name: "Present" }).click();
  await expect(page.locator(".present-pos")).toContainText("/ 5");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("region", { name: "Present" })).toBeVisible();
});
