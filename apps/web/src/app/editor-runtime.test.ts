import { describe, expect, it } from "vitest";

import { preferStarterSeed, reconcileCleanExit } from "./editor-runtime";

const store = (value: string | null) => ({ getItem: () => value });

describe("reconcileCleanExit", () => {
  it("keeps a real interruption", () => {
    const recovery = { interrupted: true, previousSessionId: "s2" };
    expect(reconcileCleanExit(recovery, store("s1"))).toBe(recovery);
    expect(reconcileCleanExit(recovery, store(null))).toBe(recovery);
    expect(reconcileCleanExit(recovery, undefined)).toBe(recovery);
  });

  it("survives a storage that throws", () => {
    const recovery = { interrupted: true, previousSessionId: "s1" };
    expect(
      reconcileCleanExit(recovery, {
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe(recovery);
  });
});

describe("preferStarterSeed", () => {
  it("honors ?seed=starter in the URL", () => {
    expect(preferStarterSeed(store(null), "?seed=starter")).toBe(true);
    expect(preferStarterSeed(store(null), "?seed=other")).toBe(false);
  });
});
