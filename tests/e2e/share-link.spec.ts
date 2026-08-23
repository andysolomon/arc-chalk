import { expect, test } from "@playwright/test";

const SECRET = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

test("Share Link keeps the fragment off the network and asks for it when missing", async ({
  page,
}) => {
  const requested: string[] = [];
  page.on("request", (request) => {
    requested.push(request.url());
  });

  await page.goto("/s/share_public");
  await expect(page.getByRole("alert")).toContainText(
    "full address, including the part after #",
  );

  await page.goto(`/s/share_public#${SECRET}`);
  await expect(page.getByRole("alert")).toBeVisible();
  expect(requested.some((url) => url.includes(SECRET))).toBe(false);
  expect(page.url()).toContain(`#${SECRET}`);

  const scriptSources = await page
    .locator("script[src]")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("src") ?? ""),
    );
  expect(
    scriptSources.every(
      (src) =>
        src.startsWith("/") ||
        src.startsWith(".") ||
        src.startsWith(page.url().slice(0, page.url().indexOf("/s/"))),
    ),
  ).toBe(true);
});

test("Share & assets lives in the More menu, not the idle inspector", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Share & assets" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Share & assets" }).click();
  await expect(
    page.getByRole("heading", { name: "Attach image" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Film Reference" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Share Link" })).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Play inspector" }),
  ).toBeVisible();
});
