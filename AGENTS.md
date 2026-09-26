# AGENTS.md

Guidance for coding agents working in this repository. Product vocabulary lives in `CONTEXT.md`; architecture decisions live in `docs/adr/`.

## Testing

These rules supersede the unit and component test layers in ADR 0021 and any skill in `.agents/skills` or `.claude/skills` that says otherwise.

1. **Never write unit tests after you write code.** A unit test written to fit code that already exists restates the implementation and catches nothing.

2. **Highly prefer E2E tests as the sole testing mechanism.** Use them to verify complex features work. At the end of E2E tests, produce a verifiable and repeatable artifact.
   - E2E specs are Playwright and live in `tests/e2e` (`bun run test:e2e`); phone workflows go in `phone-*.spec.ts`. Visual parity lives in `tests/parity`, the offline shell in `tests/pwa`.
   - Drive the feature the way a Coach would and assert on what the Coach sees or gets out.
   - End each spec with an artifact someone can inspect and regenerate: a screenshot at `testInfo.outputPath(...)`, an exported file saved with `download.saveAs(testInfo.outputPath(...))`, or a `toHaveScreenshot` baseline. Use fixed data and a fixed viewport so a rerun on the same commit produces the same artifact.

3. **If you must test a system in isolation, first write down all the ways it could fail, then write the code.**
   - Reserve this for what E2E can't practically reach, such as IndexedDB migrations from released schemas, interrupted-write recovery, sync retries and cursors, geometry edge cases, and output pagination limits.
   - Each failure mode on the list becomes one Vitest test, written before the code, that names the bug it catches.
   - A unit test that wouldn't catch a real bug the E2E suite misses doesn't belong in the repo. Delete it.
