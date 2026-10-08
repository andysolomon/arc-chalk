import { expect, test } from "./fixtures";
import {
  addDefense,
  openDefense,
  savedPlay,
  selectPlayers,
} from "./defense-helpers";

test.use({ viewport: { width: 1440, height: 960 } });

test("selected front adjusts independently; linebackers disguise without losing their drops", async ({
  page,
}, info) => {
  await page.goto("/");
  await addDefense(page);
  const before = await savedPlay(page);
  const front = before.players.filter(
    (p) => p.unit === "defense" && ["E", "T"].includes(p.label),
  );
  expect(front).toHaveLength(4);
  await selectPlayers(
    page,
    front.map((p) => p.id),
  );
  await page
    .getByRole("toolbar", { name: "Selected player actions" })
    .getByRole("button", { name: "Adjust defense" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Defensive adjustments" });
  await dialog.getByRole("button", { name: "Shift left", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await savedPlay(page)).players.find((p) => p.id === front[0]!.id)!
          .position.lateralYards,
    )
    .toBe(front[0]!.position.lateralYards - 1.5);
  const shifted = await savedPlay(page);
  expect(
    shifted.players.filter((p) => !front.some((f) => f.id === p.id)),
  ).toEqual(before.players.filter((p) => !front.some((f) => f.id === p.id)));
  await dialog.getByRole("button", { name: "Slant in", exact: true }).click();
  await expect
    .poll(async () =>
      (await savedPlay(page)).paths
        .filter((p) => front.some((f) => f.id === p.playerId))
        .map((p) => p.preset),
    )
    .toEqual(["slantin", "slantin", "slantin", "slantin"]);
  await dialog
    .getByRole("combobox", { name: "Point of attack", exact: true })
    .selectOption("1:0");
  await expect
    .poll(async () =>
      (await savedPlay(page)).paths
        .filter((p) => front.some((f) => f.id === p.playerId))
        .every((p) => p.points.at(-1)!.depthYards === -2),
    )
    .toBe(true);
  await dialog.getByRole("button", { name: "Contain", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await savedPlay(page)).paths.filter((p) => p.preset === "contain")
          .length,
    )
    .toBe(2);
  await dialog
    .getByRole("combobox", { name: "Adjustment scope" })
    .selectOption("all");
  const old = await savedPlay(page);
  const lbs = old.players.filter(
    (p) => p.unit === "defense" && ["W", "M", "S"].includes(p.label),
  );
  expect(lbs).toHaveLength(3);
  await dialog.getByRole("button", { name: "Show blitz", exact: true }).click();
  await expect
    .poll(async () =>
      (await savedPlay(page)).players
        .filter((p) => lbs.some((l) => l.id === p.id))
        .map((p) => p.position.depthYards),
    )
    .toEqual([1.5, 1.5, 1.5]);
  const shown = await savedPlay(page);
  for (const lb of lbs) {
    const was = old.paths.find((p) => p.playerId === lb.id)!;
    const now = shown.paths.find((p) => p.id === was.id)!;
    expect(now.points.at(-1)).toEqual(was.points.at(-1));
    expect(now.preset).toBe(was.preset);
  }
  await dialog
    .getByRole("button", { name: "Hide blitz look", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await savedPlay(page)).players
        .filter((p) => lbs.some((l) => l.id === p.id))
        .map((p) => p.position),
    )
    .toEqual(lbs.map((p) => p.position));
  await dialog.getByRole("button", { name: "Blitz", exact: true }).click();
  await expect
    .poll(async () =>
      (await savedPlay(page)).paths
        .filter((p) => lbs.some((l) => l.id === p.playerId))
        .every((p) => p.kind === "blitz"),
    )
    .toBe(true);
  await dialog.getByRole("button", { name: "Hook zone", exact: true }).click();
  await expect
    .poll(async () =>
      (await savedPlay(page)).paths
        .filter((p) => lbs.some((l) => l.id === p.playerId))
        .every((p) => p.preset === "hook"),
    )
    .toBe(true);
  await page.screenshot({ path: info.outputPath("defensive-adjustments.png") });
});

test("coverage shades do not drift, spacing is saved, and both read directions coexist with plaster", async ({
  page,
}, info) => {
  await page.goto("/");
  await addDefense(page);
  const before = await savedPlay(page);
  const corner = before.players.find(
    (p) => p.unit === "defense" && p.label === "C",
  )!;
  const dialog = await openDefense(page);
  await dialog
    .getByRole("button", { name: "Shade underneath", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Shade underneath", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () =>
      (await savedPlay(page)).paths.some(
        (p) => p.coverageAdjustment?.depthYards === -3,
      ),
    )
    .toBe(true);
  const shaded = await savedPlay(page);
  await dialog
    .getByRole("button", { name: "Shade underneath", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Already set");
  expect((await savedPlay(page)).paths).toEqual(shaded.paths);
  await dialog
    .getByRole("button", { name: "Reset techniques", exact: true })
    .click();
  await expect
    .poll(async () => (await savedPlay(page)).paths)
    .toEqual(before.paths);
  await dialog
    .getByRole("combobox", { name: "Corner depth", exact: true })
    .selectOption("4");
  await dialog
    .getByRole("combobox", { name: "Corner width", exact: true })
    .selectOption("18");
  await dialog
    .getByRole("combobox", { name: "Safety depth", exact: true })
    .selectOption("16");
  await dialog
    .getByRole("combobox", { name: "Safety width", exact: true })
    .selectOption("8");
  await dialog
    .getByRole("combobox", { name: "Read defender", exact: true })
    .selectOption(corner.id);
  await dialog
    .getByRole("combobox", { name: "Offense read key", exact: true })
    .selectOption("rpo");
  await dialog
    .getByRole("combobox", { name: "Offensive player to watch", exact: true })
    .selectOption("q");
  await dialog
    .getByRole("combobox", { name: "Defensive read", exact: true })
    .selectOption("pass");
  await dialog
    .getByRole("combobox", { name: "Plaster receiver", exact: true })
    .selectOption("z");
  await expect
    .poll(
      async () =>
        (await savedPlay(page)).assignments
          .filter((a) => a.playerId === corner.id)
          .flatMap((a) => a.actions)
          .filter((a) => a.kind === "read").length,
    )
    .toBe(2);
  const coached = await savedPlay(page);
  expect(
    coached.players
      .filter((p) => p.unit === "defense" && p.label === "C")
      .map((p) => p.position.depthYards),
  ).toEqual([4, 4]);
  expect(
    coached.players
      .filter((p) => p.unit === "defense" && p.label === "C")
      .map((p) => Math.abs(p.position.lateralYards)),
  ).toEqual([18, 18]);
  expect(coached.paths.filter((p) => p.playerId === corner.id)).toHaveLength(2);
  const conditional = coached.paths.find(
    (p) => p.playerId === corner.id && p.trigger === "scramble",
  )!;
  expect(conditional.points.at(-1)).toEqual(
    coached.paths
      .find((p) => p.playerId === "z" && p.kind === "route")!
      .points.at(-1),
  );
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.locator(`[data-scene-player="${corner.id}"]`),
  ).toContainText("O KEY: RPO READ");
  await expect(
    page.locator(`[data-scene-player="${corner.id}"]`),
  ).toContainText("D READ: PASS KEY");
  await page.reload();
  await expect(
    page.locator(`[data-scene-player="${corner.id}"]`),
  ).toContainText("PLASTER");
  const reopened = await openDefense(page);
  await reopened
    .getByRole("combobox", { name: "Read defender", exact: true })
    .selectOption(corner.id);
  await expect(
    reopened.getByRole("combobox", { name: "Offense read key", exact: true }),
  ).toHaveValue("rpo");
  await expect(
    reopened.getByRole("combobox", { name: "Defensive read", exact: true }),
  ).toHaveValue("pass");
  await expect(
    reopened.getByRole("combobox", {
      name: "Offensive player to watch",
      exact: true,
    }),
  ).toHaveValue("q");
  await reopened.getByRole("button", { name: "Done", exact: true }).click();
  const partner = coached.players.find(
    (p) => p.unit === "defense" && p.label === "C" && p.id !== corner.id,
  )!;
  await selectPlayers(page, [corner.id, partner.id]);
  const scheme = page.getByRole("combobox", {
    name: "Selected defensive scheme",
  });
  await scheme.selectOption("cover2man");
  await expect
    .poll(
      async () =>
        (await savedPlay(page)).paths.find(
          (p) => p.playerId === corner.id && p.trigger !== "scramble",
        )?.preset,
    )
    .toBe("man");
  await expect
    .poll(
      async () =>
        (await savedPlay(page)).paths.filter((p) => p.trigger === "scramble")
          .length,
    )
    .toBe(1);
  await page
    .getByRole("toolbar", { name: "Selected player actions" })
    .getByRole("button", { name: "Adjust defense" })
    .click();
  const selectedDialog = page.getByRole("dialog", {
    name: "Defensive adjustments",
  });
  await selectedDialog
    .getByRole("button", { name: "Shade overtop", exact: true })
    .click();
  await selectedDialog
    .getByRole("button", { name: "Done", exact: true })
    .click();
  await scheme.selectOption("cover4");
  await expect
    .poll(
      async () =>
        (await savedPlay(page)).players.find((p) => p.id === corner.id)
          ?.groupDesignation?.name,
    )
    .toBe("Cover 4");
  await expect
    .poll(async () =>
      (await savedPlay(page)).paths
        .filter(
          (p) =>
            [corner.id, partner.id].includes(p.playerId) &&
            p.trigger !== "scramble",
        )
        .map((p) => p.coverageAdjustment?.depthYards),
    )
    .toEqual([3, 3]);
  await page.keyboard.press("Escape");
  const receiver = page
    .getByRole("list", { name: "Everything on the field" })
    .getByRole("button", { name: "Z offense player", exact: true });
  await receiver.focus();
  await page.keyboard.press("Enter");
  await expect(receiver).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Delete selection — ⌫", exact: true })
    .click();
  // The roster stays: Delete clears Z's route, and plaster now follows his stance.
  await expect
    .poll(
      async () =>
        (await savedPlay(page)).paths.filter((p) => p.playerId === "z").length,
    )
    .toBe(0);
  await expect
    .poll(async () =>
      (await savedPlay(page)).paths
        .find((p) => p.trigger === "scramble")
        ?.points.at(-1),
    )
    .toEqual(coached.players.find((p) => p.id === "z")!.position);
  expect(
    (await savedPlay(page)).assignments
      .flatMap((a) => a.actions)
      .filter((a) => a.kind === "read"),
  ).toHaveLength(2);
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await savedPlay(page)).paths.filter((p) => p.trigger === "scramble")
          .length,
    )
    .toBe(1);
  await expect
    .poll(async () =>
      (await savedPlay(page)).paths
        .find((p) => p.trigger === "scramble")
        ?.points.at(-1),
    )
    .toEqual(conditional.points.at(-1));
  await page.screenshot({ path: info.outputPath("read-keys-and-plaster.png") });
});

test("Tips searches and applies a complete defensive setup as one undoable edit", async ({
  page,
}, info) => {
  await page.goto("/");
  await addDefense(page);
  const before = await savedPlay(page);
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Tips", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Defensive tips", exact: true }),
  ).toBeVisible();
  await page.getByRole("searchbox").fill("Quick flats");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Apply setup", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Play name", exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await savedPlay(page)).players.filter(
          (p) =>
            p.defensiveTechnique?.aggressive &&
            p.defensiveTechnique.depthShade === "underneath",
        ).length,
    )
    .toBe(7);
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect
    .poll(async () => (await savedPlay(page)).players)
    .toEqual(before.players);
  await expect
    .poll(async () => (await savedPlay(page)).paths)
    .toEqual(before.paths);
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Tips", exact: true })
    .click();
  await page.screenshot({ path: info.outputPath("defensive-tips.png") });
});
