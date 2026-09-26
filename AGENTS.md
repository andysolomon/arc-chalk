# Agent instructions

## Testing

These rules supersede the unit and component test layers in ADR 0021 and any skill in `.agents/skills` or `.claude/skills` that says otherwise.

- Never write unit tests after you write code.
- Highly prefer E2E tests as the sole testing mechanism. Use them to verify complex features work. At the end of E2E tests, produce a verifiable and repeatable artifact.
  - Phone workflows go in `phone-*.spec.ts`.
  - End each spec with an artifact someone can inspect and regenerate: a screenshot at `testInfo.outputPath(...)`, an exported file saved with `download.saveAs(testInfo.outputPath(...))`, or a `toHaveScreenshot` baseline. Use fixed data and a fixed viewport so a rerun on the same commit produces the same artifact.
- If you must test a system in isolation, first write down all the ways it could fail, then write the code.
  - Reserve this for what E2E can't practically reach, such as IndexedDB migrations from released schemas, interrupted-write recovery, sync retries and cursors, geometry edge cases, and output pagination limits.
  - Each failure mode on the list becomes one Vitest test, written before the code, that names the bug it catches.

Playwright specs in `tests/e2e`, `tests/parity`, and `tests/pwa` are the tests that count. A unit test that restates the implementation, freezes UI copy, or repeats a behavior those specs already cover does not catch a bug they would miss. Do not add one.
