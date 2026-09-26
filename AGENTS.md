# Agent instructions

## Testing

- Never write unit tests after you write code.
- Highly prefer E2E tests as the sole testing mechanism. Use them to verify complex features work. At the end of E2E tests, produce a verifiable and repeatable artifact.
- If you must test a system in isolation, first write down all the ways it could fail, then write the code.

Playwright specs in `tests/e2e`, `tests/parity`, and `tests/pwa` are the tests that count. A unit test that restates the implementation, freezes UI copy, or repeats a behavior those specs already cover does not catch a bug they would miss. Do not add one.
