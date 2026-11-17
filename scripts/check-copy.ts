import { readFile } from "node:fs/promises";
import { text as readAll } from "node:stream/consumers";

import { checkCopy, type CopyFinding } from "./copy-rules";

/**
 * Checks copy against the unslop rules a script can check.
 *
 *   bun scripts/check-copy.ts README.md docs/adr/0084-example.md
 *   gh pr view 251 --json body -q .body | bun scripts/check-copy.ts -
 *
 * A `.json` file is checked one string value at a time.
 */
const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("Name the files to check, or - to read standard input.");
  process.exit(2);
}

function report(source: string, findings: readonly CopyFinding[]): void {
  for (const finding of findings) {
    console.log(
      `${source}:${finding.line}: rule ${finding.rule}: ${finding.message} Found "${finding.found}".`,
    );
  }
}

function jsonStrings(value: unknown, path: string): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      jsonStrings(item, `${path}[${index}]`),
    );
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      jsonStrings(item, path === "" ? key : `${path}.${key}`),
    );
  }
  return [];
}

let total = 0;
for (const target of targets) {
  const text =
    target === "-"
      ? await readAll(process.stdin)
      : await readFile(target, "utf8");
  if (target.endsWith(".json")) {
    for (const [path, value] of jsonStrings(JSON.parse(text), "")) {
      const findings = checkCopy(value);
      report(`${target} ${path}`, findings);
      total += findings.length;
    }
  } else {
    const findings = checkCopy(text);
    report(target === "-" ? "stdin" : target, findings);
    total += findings.length;
  }
}

if (total > 0) {
  console.log(`\n${total} to fix. The rules are in .agents/skills/unslop.`);
  process.exit(1);
}
console.log("No pattern found. Read the copy against the unslop skill too.");
