import { describe, expect, it } from "vitest";

import {
  acceptSource,
  detailLayers,
  outputFormat,
  outputFormats,
  paperInches,
  paperLabel,
  previewCss,
  readOutputPresets,
  rememberPreset,
  withPreviewCss,
} from "@chalk/exports";

describe("the output catalogue (issue #69)", () => {
  it("reaches every generator that existed before, in four groups", () => {
    expect(outputFormats.map(({ id }) => id)).toEqual([
      "field",
      "png",
      "svg",
      "callSheet",
      "wristband",
      "practice",
      "scout",
      "binder",
      "handout",
      "install",
      "position",
      "quiz",
      "slide",
      "progression",
      "frames",
    ]);
  });

  it("says why a format cannot take the source instead of swapping the source", () => {
    const install = outputFormat("install");
    expect(acceptSource(install, { kind: "current", playCount: 1 })).toEqual({
      ok: true,
    });
    const several = acceptSource(install, { kind: "selection", playCount: 3 });
    expect(!several.ok && several.reason).toContain("one play");
    const book = acceptSource(install, { kind: "book", playCount: 40 });
    expect(!book.ok && book.reason).toContain("not the full playbook");
    const sheet = outputFormat("callSheet");
    expect(acceptSource(sheet, { kind: "selection", playCount: 0 })).toEqual({
      ok: false,
      reason: "Pick at least one play.",
    });
    const unprepared = acceptSource(sheet, {
      kind: "plan",
      playCount: 4,
      prepared: false,
    });
    expect(!unprepared.ok && unprepared.reason).toContain("not been prepared");
    expect(
      acceptSource(sheet, { kind: "plan", playCount: 4, prepared: true }),
    ).toEqual({ ok: true });
    expect(
      acceptSource(sheet, { kind: "current", playCount: 1 }),
    ).toMatchObject({
      ok: false,
    });
  });

  it("turns layers on explicitly for each detail preset", () => {
    expect(detailLayers("full")).toEqual({
      reads: true,
      assigns: true,
      notes: true,
      text: true,
    });
    expect(detailLayers("coaching").notes).toBe(false);
    expect(detailLayers("diagram")).toEqual({
      reads: false,
      assigns: false,
      notes: false,
      text: false,
    });
  });

  it("names the paper as it will print and lays the preview out at that size", () => {
    expect(paperLabel(outputFormat("field").paper)).toBe(
      "Letter landscape · half-inch margins",
    );
    expect(paperLabel(outputFormat("callSheet").paper)).toBe(
      "Letter landscape · 0.4 in margins",
    );
    expect(paperLabel(outputFormat("slide").paper)).toBe(
      "1920 × 1080 slide · no margins",
    );
    expect(paperLabel(undefined)).toBe("Image file — no page");
    expect(paperInches(outputFormat("install").paper!)).toEqual({
      width: 8.5,
      height: 11,
    });
    expect(paperInches(outputFormat("field").paper!)).toEqual({
      width: 11,
      height: 8.5,
    });
    const css = previewCss(outputFormat("install").paper!, true);
    expect(css).toContain("width:7.5in");
    expect(css).toContain("padding:0.5in");
    expect(css).toContain("grayscale(1)");
    const html = withPreviewCss(
      "<html><head><title>x</title></head><body></body></html>",
      css,
    );
    expect(html.indexOf("<style>")).toBeLessThan(html.indexOf("</head>"));
  });

  it("keeps the last six outputs, one per format and source, newest first", () => {
    let presets = readOutputPresets([
      {
        id: "a",
        name: "A",
        format: "callSheet",
        sourceKind: "plan",
        detail: "full",
        mono: false,
        atMs: 1,
      },
      { id: "junk", name: "J", format: "nope", sourceKind: "plan" },
    ]);
    expect(presets.map(({ id }) => id)).toEqual(["a"]);
    for (let n = 0; n < 8; n += 1) {
      presets = rememberPreset(presets, {
        id: `p${n}`,
        name: `P${n}`,
        format: n % 2 ? "wristband" : "install",
        sourceKind: n % 3 ? "selection" : "current",
        detail: "full",
        mono: false,
        atMs: n,
      });
    }
    expect(presets.length).toBeLessThanOrEqual(6);
    expect(presets[0]!.id).toBe("p7");
    const pairs = presets.map((p) => `${p.format}:${p.sourceKind}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });
});
