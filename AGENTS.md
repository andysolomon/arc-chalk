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

## Verifying in a browser

- After you implement a change a Coach can see, and before you open a pull request, run the `verify-chalk` skill in `.agents/skills/verify-chalk`. It drives this checkout's own copy of the app in Chromium and keeps screenshots, a video and a trace for each run.
- Put the evidence list from its report in the pull request's Testing section.
- When asked to demo a feature, run the `demo-kit` skill in `.agents/skills/demo-kit`.

## Diagrams and charts

- When asked for a diagram or a chart of the app or of a feature, draw it with the Diagram Design skill. This holds in docs, ADRs, pull requests, chat and demo kits. Do not write Mermaid, ASCII art or a one-off SVG in its place.
- The `.diagram-design` file at the repo root selects the `chalk` profile, so diagrams use Chalk's colors. If the skill reports that profile missing, copy `docs/design/diagram-design-chalk-profile.md` to `~/.diagram-design/profiles/chalk.md`.

## Copy

- Hold every sentence you write for a person to the rules in `.agents/skills/unslop/SKILL.md`. That covers UI text, docs, ADRs, commit messages, pull request bodies, skill files and demo kits.
- Run `bun scripts/check-copy.ts <files>` for the rules a script can check. Pipe a pull request body in with `-` as the file. Then read the copy against the skill for the rules a script cannot check.
- Write names and UI text exactly as the app shows them, in double quotes or backticks. The check skips quoted text, so the Play named "Stick — Thunder" keeps its dash.
- Leave existing UI text alone. Parity governs it, and these rules are not a reason to rewrite it. New UI text follows these rules and keeps a pattern the app already uses, such as the toast "Goal Line Right — 11 added".
