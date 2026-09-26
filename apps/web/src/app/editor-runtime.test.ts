import { describe, expect, it } from "vitest";

import { reconcileCleanExit } from "./editor-runtime";

const store = (value: string | null) => ({ getItem: () => value });

describe("reconcileCleanExit", () => {
  it("keeps a real interruption", () => {
    const recovery = { interrupted: true, previousSessionId: "s2" };
    expect(reconcileCleanExit(recovery, store("s1"))).toBe(recovery);
    expect(reconcileCleanExit(recovery, store(null))).toBe(recovery);
    expect(reconcileCleanExit(recovery, undefined)).toBe(recovery);
  });
});
