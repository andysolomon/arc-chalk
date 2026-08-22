import { readFileSync } from "node:fs";
import { createSharePublication, playDocumentSchema } from "@chalk/domain";
import { offensiveStickThunderPlay } from "@chalk/test-fixtures";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { openShareFromLocation } from "./share-location";
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
  it("does not send a missing fragment to Convex", async () => {
    const open = vi.fn();
    await expect(
      openShareFromLocation(open, {
        pathname: "/s/share_public",
        hash: "",
      }),
    ).resolves.toEqual({ status: "missing-secret" });
    expect(open).not.toHaveBeenCalled();
  });

  it("asks the Coach for the complete address when the fragment is missing", async () => {
    window.history.replaceState({}, "", "/s/share_public");
    window.location.hash = "";
    render(
      <ShareApp openShare={() => Promise.resolve({ outcome: "not-found" })} />,
    );
    expect(
      await screen.findByText(/full address, including the part after #/i),
    ).toBeVisible();
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

  it("shows Film References as external links that do not leak the secret", async () => {
    window.history.replaceState({}, "", "/s/share_public");
    window.location.hash = secret;
    const play = playDocumentSchema.parse({
      ...structuredClone(offensiveStickThunderPlay),
      filmReferences: [
        {
          id: "film_hudl",
          url: "https://www.hudl.com/video/3/clip",
          label: "Install cut-up",
        },
      ],
    });
    render(
      <ShareApp
        openShare={() =>
          Promise.resolve({
            outcome: "granted",
            publication: createSharePublication({
              id: "publication_share_shell",
              title: "Install Two",
              publishedAtMs: 1,
              entries: [
                {
                  id: "entry_one",
                  playRevisionId: "revision_one",
                  play,
                },
              ],
              presentation: {
                fieldStyle: "lines",
                playback: true,
                downloads: [],
              },
            }),
          })
        }
      />,
    );
    const link = await screen.findByRole("link", { name: "Install cut-up" });
    expect(link).toHaveAttribute("href", "https://www.hudl.com/video/3/clip");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(link.getAttribute("href")).not.toContain(secret);
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
