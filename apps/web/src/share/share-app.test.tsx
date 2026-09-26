import { readFileSync } from "node:fs";
import { createSharePublication } from "@chalk/domain";
import { offensiveStickThunderPlay } from "@chalk/test-fixtures";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ShareApp } from "./share-app";

const secret = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function publication() {
  return createSharePublication({
    id: "publication_share_shell",
    title: "Install Two",
    publishedAtMs: 1,
    entries: [
      {
        id: "entry_one",
        playRevisionId: "revision_one",
        play: offensiveStickThunderPlay,
      },
    ],
    presentation: { fieldStyle: "lines", playback: true, downloads: [] },
  });
}

describe("Share shell", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });
  it("plays a granted publication without exposing notes", async () => {
    window.history.replaceState({}, "", "/s/share_public");
    window.location.hash = secret;
    const published = publication();
    render(
      <ShareApp
        openShare={() =>
          Promise.resolve({
            outcome: "granted",
            publication: published,
          })
        }
      />,
    );
    expect(
      await screen.findByRole("region", { name: "Share Link" }),
    ).toBeVisible();
    expect(screen.getByText("Install Two", { exact: false })).toBeVisible();
    expect(screen.queryByText("Do not publish")).toBeNull();
    await waitFor(() => {
      expect(
        screen.getByRole("img", {
          name: `${published.entries[0]!.play.name} football play`,
        }),
      ).toBeVisible();
    });
  });

  it("declares a strict CSP and no-referrer policy in the share shell", () => {
    const html = readFileSync("apps/web/share.html", "utf8");
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("default-src 'self'");
    expect(html).toContain("script-src 'self'");
    expect(html).not.toContain("cdn.");
    expect(html).toContain('name="referrer" content="no-referrer"');
    expect(html).toContain("noindex");
  });
});
