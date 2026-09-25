import { describe, expect, it } from "vitest";

import {
  findForbiddenImports,
  importedSpecifiers,
} from "../../scripts/package-boundaries";

describe("workspace boundaries", () => {
  it("rejects static and dynamic imports that cross an inward boundary", () => {
    const source = `
      import React from "react";
      export { query } from "convex/server";
      const editor = import("@chalk/editor/tools");
    `;

    expect(importedSpecifiers(source)).toEqual([
      "react",
      "convex/server",
      "@chalk/editor/tools",
    ]);
    expect(
      findForbiddenImports(source, ["react", "convex", "@chalk/editor"]),
    ).toEqual(["react", "convex/server", "@chalk/editor/tools"]);
  });
});
