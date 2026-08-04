import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { findForbiddenImports } from "./package-boundaries";

const root = fileURLToPath(new URL("../", import.meta.url));

const forbiddenByBoundary: Record<string, readonly string[]> = {
  "packages/domain": [
    "react",
    "dexie",
    "convex",
    "@tanstack/",
    "@chalk/editor",
    "@chalk/render",
    "@chalk/local-db",
    "@chalk/sync",
    "@chalk/exports",
  ],
  "packages/contracts": ["react", "dexie", "convex", "@tanstack/"],
  "packages/render": [
    "react",
    "dexie",
    "convex",
    "@tanstack/",
    "@chalk/editor",
    "@chalk/local-db",
    "@chalk/sync",
  ],
};

async function sourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if ([".ts", ".tsx"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

const violations: string[] = [];
for (const [boundary, forbiddenImports] of Object.entries(
  forbiddenByBoundary,
)) {
  for (const file of await sourceFiles(join(root, boundary, "src"))) {
    const source = await readFile(file, "utf8");
    for (const specifier of findForbiddenImports(source, forbiddenImports)) {
      violations.push(
        `${relative(root, file)} imports forbidden dependency ${specifier}`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("Package dependency directions are valid.");
