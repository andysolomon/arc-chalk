import { describe, expect, it } from "vitest";

import {
  acceptSource,
  outputFormat,
  readOutputPresets,
  rememberPreset,
} from "@chalk/exports";

describe("the output catalogue (issue #69)", () => {
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
