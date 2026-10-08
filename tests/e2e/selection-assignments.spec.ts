import type { PlayDocument } from "@chalk/domain";
import type { Page } from "@playwright/test";
import { expect, startNewPlay, test } from "./fixtures";

test.use({ viewport: { width: 1440, height: 960 } });

async function selectPlayers(page: Page, ids: readonly string[]) {
  await page.keyboard.press("Escape");
  for (const [index, id] of ids.entries()) {
    const point = await page
      .locator(`[data-scene-player="${id}"]`)
      .evaluate((node) => {
        const matrix = (node as SVGGraphicsElement).getScreenCTM()!;
        const at = new DOMPoint(0, 0).matrixTransform(matrix);
        return { x: at.x, y: at.y };
      });
    if (index) await page.keyboard.down("Shift");
    await page.mouse.click(point.x, point.y);
    if (index) await page.keyboard.up("Shift");
  }
}

async function savedPlay(page: Page): Promise<PlayDocument> {
  const name = await page
    .getByRole("textbox", { name: "Play name" })
    .inputValue();
  return page.evaluate(
    (name) =>
      new Promise<PlayDocument>((resolve, reject) => {
        const open = indexedDB.open("chalk-production-beta");
        open.onerror = () =>
          reject(open.error ?? new Error("Could not open play database"));
        open.onsuccess = () => {
          const db = open.result;
          const read = db
            .transaction("plays", "readonly")
            .objectStore("plays")
            .getAll();
          read.onerror = () => {
            db.close();
            reject(read.error ?? new Error("Could not read play database"));
          };
          read.onsuccess = () => {
            db.close();
            const rows = read.result as Array<{ document: PlayDocument }>;
            const row = rows.find(
              (row: { document: PlayDocument }) => row.document.name === name,
            );
            if (row) resolve(row.document);
            else reject(new Error("Play not saved"));
          };
        };
      }),
    name,
  );
}

const toolbar = (page: Page) =>
  page.getByRole("toolbar", { name: "Selected player actions" });

test("three receivers become trips, swap slots with their routes, persist and undo", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.locator('[data-scene-player="z"]')).toBeVisible();
  const before = await savedPlay(page);
  await selectPlayers(page, ["x", "y", "z"]);
  await expect(
    toolbar(page).getByRole("button", { name: "Double team", exact: true }),
  ).toHaveCount(0);
  await toolbar(page)
    .getByRole("button", { name: "Trips right", exact: true })
    .click();
  await expect(
    toolbar(page).getByRole("combobox", { name: "Receiver 1", exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await savedPlay(page)).players.filter(
          (man) => man.groupDesignation?.kind === "trips",
        ).length,
    )
    .toBe(3);
  const trips = await savedPlay(page);
  const order = trips.players
    .filter((man) => man.groupDesignation?.kind === "trips")
    .sort((a, b) => a.groupDesignation!.order! - b.groupDesignation!.order!)
    .map((man) => man.id);
  expect(
    trips.players
      .filter((man) => order.includes(man.id))
      .every((man) => man.position.lateralYards > 0),
  ).toBe(true);
  expect(trips.players.filter((man) => !order.includes(man.id))).toEqual(
    before.players.filter((man) => !order.includes(man.id)),
  );
  await toolbar(page)
    .getByRole("button", { name: "Reverse order", exact: true })
    .click();
  await expect(
    toolbar(page).getByRole("combobox", { name: "Receiver 1", exact: true }),
  ).toHaveValue(order[2]!);
  await expect
    .poll(
      async () =>
        (await savedPlay(page)).players.find((man) => man.id === order[2])
          ?.groupDesignation?.order,
    )
    .toBe(1);
  const reversed = await savedPlay(page);
  for (const id of order) {
    const was = trips.players.find((man) => man.id === id)!;
    const now = reversed.players.find((man) => man.id === id)!;
    const pathBefore = trips.paths.find((path) => path.playerId === id)!;
    const pathAfter = reversed.paths.find((path) => path.id === pathBefore.id)!;
    expect(
      pathAfter.points[0]!.lateralYards - pathBefore.points[0]!.lateralYards,
    ).toBeCloseTo(now.position.lateralYards - was.position.lateralYards, 3);
  }
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect(
    toolbar(page).getByRole("combobox", { name: "Receiver 1", exact: true }),
  ).toHaveValue(order[0]!);
  await toolbar(page)
    .getByRole("combobox", { name: "Receiver 1", exact: true })
    .selectOption(order[1]!);
  await expect(
    toolbar(page).getByRole("combobox", { name: "Receiver 2", exact: true }),
  ).toHaveValue(order[0]!);
  await expect
    .poll(
      async () =>
        (await savedPlay(page)).players.find((man) => man.id === order[1])
          ?.groupDesignation?.order,
    )
    .toBe(1);
  await page.reload();
  await expect(page.locator('[data-scene-player="z"]')).toBeVisible();
  await selectPlayers(page, [order[1]!]);
  await expect(
    toolbar(page).getByRole("combobox", { name: "Receiver 1", exact: true }),
  ).toHaveValue(order[1]!);
  await toolbar(page)
    .getByRole("button", { name: "Trips left", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await savedPlay(page)).players
        .filter((man) => order.includes(man.id))
        .every((man) => man.position.lateralYards < 0),
    )
    .toBe(true);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(
    toolbar(page).getByRole("button", { name: "Reverse order", exact: true }),
  ).toBeVisible();
  const bounds = await toolbar(page).evaluate((node) => {
    const bar = node.getBoundingClientRect();
    const field = node.parentElement!.getBoundingClientRect();
    return {
      inside: bar.left >= field.left && bar.right <= field.right,
      noOverflow: node.scrollWidth <= node.clientWidth,
    };
  });
  expect(bounds).toEqual({ inside: true, noOverflow: true });
  await page.screenshot({ path: info.outputPath("trips-tablet-order.png") });
  await page.setViewportSize({ width: 1440, height: 960 });
  await toolbar(page)
    .getByRole("button", { name: "Trips right", exact: true })
    .click();
  await expect(
    toolbar(page).getByRole("button", { name: "Trips right", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: info.outputPath("trips-receiver-order.png") });
});

test("two linemen double team one target and keep other assignments", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.locator('[data-scene-player="ol0"]')).toBeVisible();
  await page.keyboard.press("Control+Shift+d");
  const browser = page.getByRole("dialog", { name: "Defenses" });
  await browser
    .getByRole("textbox", { name: "Search defenses" })
    .fill("4-3 Cover 3");
  await browser.getByText("4-3 Cover 3", { exact: true }).click();
  await expect(browser).toBeHidden();
  const before = await savedPlay(page);
  const target = before.players.find(
    (man) => man.unit === "defense" && man.label === "T",
  )!;
  await selectPlayers(page, ["ol0", "ol1"]);
  await expect(
    toolbar(page).getByRole("button", { name: "Trips right", exact: true }),
  ).toHaveCount(0);
  await toolbar(page)
    .getByRole("button", { name: "Double team", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await savedPlay(page)).paths.filter((path) => path.kind === "block")
          .length,
    )
    .toBe(2);
  const after = await savedPlay(page);
  const blocks = after.paths.filter((path) => path.kind === "block");
  expect(blocks[0]!.points.at(-1)).toEqual(blocks[1]!.points.at(-1));
  expect(after.paths.filter((path) => path.kind !== "block")).toEqual(
    before.paths,
  );
  expect(
    after.assignments.filter((assignment) => assignment.text === "Double team"),
  ).toHaveLength(2);
  await toolbar(page)
    .getByRole("combobox", { name: "Double team target" })
    .selectOption(target.id);
  await toolbar(page)
    .getByRole("button", { name: "Double team", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await savedPlay(page)).assignments.filter(
          (assignment) => assignment.text === "Double team",
        ).length,
    )
    .toBe(2);
  await expect
    .poll(async () =>
      (await savedPlay(page)).paths
        .filter((path) => path.kind === "block")
        .map((path) => path.points.at(-1)),
    )
    .toEqual([target.position, target.position]);
  const targeted = await savedPlay(page);
  expect(
    targeted.assignments
      .filter((assignment) => assignment.text === "Double team")
      .every((assignment) =>
        assignment.actions.some(
          (action) =>
            action.kind === "block" &&
            action.target?.kind === "player" &&
            action.target.playerId === target.id,
        ),
      ),
  ).toBe(true);
  await toolbar(page)
    .getByRole("button", { name: "Remove designation", exact: true })
    .click();
  await expect(
    toolbar(page).getByText("2 players selected", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect(
    toolbar(page).getByRole("button", {
      name: "Remove designation",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("double-team.png") });
});

test("a corner and safety run 2-man without changing the remaining defense", async ({
  page,
}, info) => {
  await page.goto("/");
  await startNewPlay(page, "defensive");
  await page.keyboard.press("Control+Shift+d");
  const browser = page.getByRole("dialog", { name: "Defenses" });
  await browser
    .getByRole("textbox", { name: "Search defenses" })
    .fill("4-3 Cover 3");
  await browser.getByText("4-3 Cover 3", { exact: true }).click();
  await expect(browser).toBeHidden();
  await expect(
    page.locator('[data-scene-player][aria-label$="defense player"]'),
  ).toHaveCount(11);
  const before = await savedPlay(page);
  const corner = before.players.find(
    (man) => man.unit === "defense" && man.label === "C",
  )!;
  const safety = before.players.find(
    (man) => man.unit === "defense" && man.label === "F",
  )!;
  const ids = [corner.id, safety.id];
  await selectPlayers(page, ids);
  await toolbar(page)
    .getByRole("combobox", { name: "Selected defensive scheme" })
    .selectOption("cover2man");
  await expect
    .poll(
      async () =>
        (await savedPlay(page)).players.filter(
          (man) => man.groupDesignation?.name === "Cover 2 Man",
        ).length,
    )
    .toBe(2);
  const after = await savedPlay(page);
  expect(after.paths.find((path) => path.playerId === corner.id)?.preset).toBe(
    "man",
  );
  expect(after.paths.find((path) => path.playerId === safety.id)?.preset).toBe(
    "deep2",
  );
  expect(after.paths.filter((path) => !ids.includes(path.playerId))).toEqual(
    before.paths.filter((path) => !ids.includes(path.playerId)),
  );
  expect(after.players.filter((man) => !ids.includes(man.id))).toEqual(
    before.players.filter((man) => !ids.includes(man.id)),
  );
  expect(after.unitCalls).toEqual(before.unitCalls);
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect
    .poll(async () => (await savedPlay(page)).paths)
    .toEqual(before.paths);
  await toolbar(page)
    .getByRole("combobox", { name: "Selected defensive scheme" })
    .selectOption("cover2man");
  await expect(
    toolbar(page).getByText("Cover 2 Man", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("selected-2-man.png") });
});
