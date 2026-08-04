---
status: accepted
---

# Gate beta releases with layered tests and real-device performance checks

Chalk combines fast domain tests, user-focused component tests, real-browser integration tests, deterministic output fixtures, and physical-device release checks. Correctness, migration safety, accessibility, and the accepted interaction budgets are release criteria.

## Consequences

- Vitest tests domain commands, repositories, synchronization, geometry, path sampling, and render-scene behavior.
- React Testing Library and `user-event` test components through Coach-visible behavior rather than implementation details.
- Playwright covers Chromium and WebKit workflows for desktop and iPad-class viewports and input modes.
- IndexedDB migrations run in real browsers against fixture databases produced by every released schema version.
- Property-based tests cover coordinate transforms, path sampling invariants, canonical revision hashing, idempotent retries, and cursor progression.
- Deterministic SVG and PDF fixtures verify structured output; focused visual comparisons cover rendering behavior that structural assertions cannot.
- Automated accessibility checks supplement complete keyboard-only workflow tests and manual screen-reader checks of critical flows.
- CI enforces bundle-size and offline app-shell budgets.
- Standard fixtures include a normal 22-player Play and a Playbook containing 2,000 Plays without eagerly loaded revision documents.
- Automated performance tests detect regressions in open, local save, render, playback, sync, and export paths.
- Every release candidate is checked on a physical ninth-generation iPad and a five-year-old laptop.
- A beta deployment is blocked by failed correctness, migration, accessibility, or accepted performance gates. No flaky performance result is waived without a recorded investigation and repeatable replacement measurement.

