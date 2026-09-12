import { describe, expect, it } from "vitest";

import { preferStarterSeed, reconcileCleanExit } from "./editor-runtime";

const store = (value: string | null) => ({ getItem: () => value });

describe("reconcileCleanExit", () => {
  it("clears an interruption whose session was marked closed at pagehide", () => {
    expect(
      reconcileCleanExit(
        { interrupted: true, previousSessionId: "s1", previousStartedAtMs: 5 },
        store("s1"),
      ),
    ).toEqual({ interrupted: false });
  });

  it("keeps a real interruption", () => {
    const recovery = { interrupted: true, previousSessionId: "s2" };
    expect(reconcileCleanExit(recovery, store("s1"))).toBe(recovery);
    expect(reconcileCleanExit(recovery, store(null))).toBe(recovery);
    expect(reconcileCleanExit(recovery, undefined)).toBe(recovery);
  });

  it("leaves a clean start alone", () => {
    const recovery = { interrupted: false };
    expect(reconcileCleanExit(recovery, store("s1"))).toBe(recovery);
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
  it("is off by default so a fresh device stays blank", () => {
    expect(preferStarterSeed(store(null), "")).toBe(false);
  });

  it("honors the session opt-in used by automated shells", () => {
    expect(preferStarterSeed(store("1"), "")).toBe(true);
  });

  it("honors ?seed=starter in the URL", () => {
    expect(preferStarterSeed(store(null), "?seed=starter")).toBe(true);
    expect(preferStarterSeed(store(null), "?seed=other")).toBe(false);
  });
});
