import { describe, expect, it, vi } from "vitest";

import { printInWindow } from "./print-frame";

describe("printInWindow", () => {
  it("reports a blocked pop-up instead of swallowing it", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    expect(printInWindow("<html></html>")).toEqual({
      ok: false,
      reason: "blocked",
    });
    open.mockRestore();
  });
});
