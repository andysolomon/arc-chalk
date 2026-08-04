import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  findForbiddenImports,
  importedSpecifiers,
} from "../../scripts/package-boundaries";

describe("workspace boundaries", () => {
  it("keeps the domain package framework-free", async () => {
    const source = await readFile("packages/domain/src/index.ts", "utf8");

    expect(source).not.toContain("react");
    expect(source).not.toContain("convex");
    expect(source).not.toContain("dexie");
  });

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
