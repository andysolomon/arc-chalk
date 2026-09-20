import { expect, test, type Page } from "@playwright/test";

const PLAY = "Stick — Thunder football play";

async function shellReady(page: Page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("chalk.seedStarter", "1");
    } catch {
      // Query string below still opts in.
    }
  });
  await page.goto("/?seed=starter");
  await expect(page.getByRole("img", { name: PLAY })).toBeVisible();
  // The worker must control the page before the network is cut.
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.active?.state === "activated";
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

test("precaches only the versioned shell, never Play data", async ({
  page,
}) => {
  await shellReady(page);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls: string[] = [];
    for (const name of names) {
      const keys = await (await caches.open(name)).keys();
      urls.push(...keys.map((request) => new URL(request.url).pathname));
    }
    return { names, urls };
  });
  expect(
    cached.names.every((name) => name.startsWith("workbox-precache")),
  ).toBe(true);
  expect(cached.urls).toContain("/index.html");
  expect(cached.urls).toContain("/manifest.webmanifest");
  // share.html is the second, sandboxed shell Phase 8 serves Share Links from;
  // it is static app shell like index.html, and carries no Play data either.
  expect(cached.urls).toContain("/share.html");
  const shellOnly =
    /^\/(index\.html|share\.html|manifest\.webmanifest|favicon\.svg|icons\/.+\.png|assets\/.+\.(js|css))$/;
  expect(cached.urls.filter((url) => !shellOnly.test(url))).toEqual([]);
});

test("opens the shell and the Coach's saved Play with the network off", async ({
  context,
  page,
}) => {
  await shellReady(page);
  const playName = page.getByRole("textbox", { name: "Play name" });
  await playName.fill("Saved before the network dropped");
  await playName.press("Enter");
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();

  await context.setOffline(true);
  await expect(
    page.locator(".lifecycle-notices .notice.offline"),
  ).toBeVisible();
  // A fresh document under Chromium's offline emulation still reports
  // navigator.onLine as true, so the banner is asserted on the live page
  // above; what the reload proves is that the shell and the Play come back
  // without the network.
  const started = Date.now();
  await page.reload();
  await expect(
    page.getByRole("img", {
      name: "Saved before the network dropped football play",
    }),
  ).toBeVisible();
  const elapsed = Date.now() - started;
  await expect(page.locator(".notice.recovery")).toHaveCount(0);
  await expect(page.locator(".notice.shell-fault")).toHaveCount(0);
  // Warm offline start budget: under one second to a painted Play.
  expect(elapsed).toBeLessThan(1000);
});

test("an ordinary reload raises no recovery notice", async ({ page }) => {
  await shellReady(page);
  await page.reload();
  await expect(page.getByRole("img", { name: PLAY })).toBeVisible();
  await expect(page.locator(".notice.recovery")).toHaveCount(0);
});

test("serves an installable manifest and its icons", async ({ page }) => {
  await shellReady(page);
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();
  const response = await page.request.get(href!);
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as {
    display: string;
    icons: readonly { src: string; sizes: string; purpose?: string }[];
  };
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  expect(manifest.icons.some((icon) => icon.sizes === "512x512")).toBe(true);
  for (const icon of manifest.icons) {
    expect((await page.request.get(icon.src)).ok()).toBe(true);
  }
});

test("a stale cached shell is refused and repaired without touching data", async ({
  page,
}) => {
  await shellReady(page);
  const playName = page.getByRole("textbox", { name: "Play name" });
  await playName.fill("Kept across the repair");
  await playName.press("Enter");
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();

  // Pretend a newer shell already ran against this device's data.
  await page.evaluate(() =>
    localStorage.setItem("chalk.shell.dataVersion", "9999"),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toHaveText(
    /newer Chalk than the copy the browser kept/,
  );
  await page.getByRole("button", { name: "Load current version" }).click();
  await expect(
    page.getByRole("img", { name: "Kept across the repair football play" }),
  ).toBeVisible();
  const registrations = await page.evaluate(
    async () => (await navigator.serviceWorker.getRegistrations()).length,
  );
  // The shell re-registers on the fresh load; the stale one is gone.
  expect(registrations).toBeLessThanOrEqual(1);
});

test("never hands a Share Link the editor shell", async ({ page }) => {
  await shellReady(page);
  // A Share Link is remote, sandboxed content that the host (and the preview
  // server) rewrite onto share.html. With the worker installed, /s/ must not
  // be answered from the precached editor shell.
  const served = await page.evaluate(async () => {
    const response = await fetch("/s/some-published-id", {
      mode: "same-origin",
      redirect: "follow",
    });
    return { status: response.status, body: await response.text() };
  });
  expect(served.status).toBe(200);
  expect(served.body).toContain("Chalk Share");
  expect(served.body).not.toContain("<title>Chalk</title>");
});

test("reopens a prepared game plan in Game Day after an offline restart", async ({
  context,
  page,
}) => {
  await shellReady(page);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Game plans…" }).click();
  const workspace = page.getByRole("region", { name: "Game plans" });
  await workspace.getByRole("button", { name: "New plan" }).click();
  await workspace.getByLabel("Plan name").fill("Week 3");
  await workspace.getByRole("button", { name: "Create plan" }).click();
  await workspace.getByRole("checkbox", { name: /^Stick — Thunder$/ }).check();
  await workspace.getByRole("button", { name: /^Add 1 to plan/ }).click();
  const code = workspace.getByLabel(/^Call number for/).first();
  await code.fill("12");
  await code.press("Enter");
  await workspace.getByRole("button", { name: "Prepare for game" }).click();
  await expect(workspace.getByText(/^Prepared/)).toBeVisible();
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Game Day", exact: true })
    .click();
  await page.getByRole("button", { name: /Week 3/ }).click();
  await expect(page.getByText(/Ready offline · 1 call$/)).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  const reader = page.getByRole("main", { name: "Game Day" });
  // The Unit is a badge beside the plan's name now, not a "·" prefix
  // (ADR 0051), so the title reads "Offense Week 3".
  await expect(reader.getByText("Offense Week 3")).toBeVisible();
  await expect(reader.getByText(/Ready offline · 1 call$/)).toBeVisible();
  await reader
    .getByRole("navigation", { name: "Calls" })
    .getByRole("button", { name: /^12 / })
    .click();
  await expect(
    reader
      .getByRole("region", { name: "Selected call" })
      .locator("svg.field-diagram"),
  ).toBeVisible();
  await context.setOffline(false);
});
