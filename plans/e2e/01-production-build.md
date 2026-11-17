# Plan 01. Run the suite against the production build

Read `plans/e2e/README.md` first.

## Why

The suite tests the Vite dev server. The dev server sends the app as hundreds of unbundled modules, so every test pays for that on load, and no test runs the code that ships.

Measured on 2026-11-16 on Chromium with 2 workers, same machine, both runs at once:

- The whole `chromium` project took 6.4 minutes on the dev server and 4.1 minutes on the build.
- The 212 tests that passed on both took 518 seconds on the dev server and 299 on the build. That is 42% less.
- On the build, 34 tests failed. 32 of them failed for one reason, below. The other two were a frame budget in `editor-performance.spec.ts` and a timeout in `playbook-library.spec.ts`, both from running two suites at once.
- WebKit and the phone projects were not measured. They cannot run on the workstation.

The config also starts its server on port 4173 and reuses whatever answers there. From a second worktree that is another checkout's code.

## What to build

1. **Serve the build.** In `playwright.config.ts`, make `webServer.command` build the app and serve it with `vite preview`, the way `tests/pwa/playwright.config.ts` does. Pass `--host 127.0.0.1`, the port, and `--strictPort`.
2. **Block service workers.** Set `serviceWorkers: "block"` in `use`. The build registers the service worker and shows a notice with `role="status"` that reads `Chalk itself is ready to open without a connection.` 31 calls to `page.getByRole("status")` in 14 spec files then match two elements and fail in strict mode. With the block, the eight spec files that failed this way, plus `offline-shell.spec.ts` and `sync-local.spec.ts`, passed on the build: 104 passed, 1 skipped. `tests/pwa` has its own config and still tests the worker.
3. **Give each checkout its own port.** Read the port from `CHALK_E2E_PORT`. In CI default to 4173. Outside CI, when the variable is unset, derive a port from the checkout's path so two worktrees never pick the same one. Use the port in `baseURL` and in the server command.
4. **Never reuse a server.** Set `reuseExistingServer: false`. A reused build can be stale, and a reused port can be another checkout. With `--strictPort` a busy port fails with a message that names it.
5. **Update the docs that describe the old behavior.** The `ship` skill's preflight warns about port 4173. The `verify-chalk` skill's first gotcha says the same. Rewrite both to match.

## Do not

- Do not change `tests/parity` or `tests/pwa`. The parity config still uses the dev server on 4173, and that is a later question.
- Do not add a switch that points the suite back at the dev server. The `verify-chalk` skill already drives the dev server for fast local work.
- Do not edit a spec in this plan. If a spec fails only on the build for a reason other than the status notice, stop and report what it depends on.

## Risks to check

- A spec may depend on something only the dev server does. `apps/web/vite.config.ts` strips the share page's Content Security Policy in dev. `share-link.spec.ts` passed on the build on Chromium. Confirm it on WebKit in CI.
- Each CI shard now builds before it tests. The Quality job's build step took 18 seconds. Record what the build adds to each shard.
- A local run now builds every time. Record how long `bun run test:e2e -- --project=chromium <one spec>` takes from a cold start.

## Done when

- [ ] All four projects pass in CI against the build, on the first attempt or with no more retries than the baseline.
- [ ] The pull request body gives the Browser journeys step time for each shard before and after, with both run IDs. The baseline is 267, 268, 407 and 440 seconds.
- [ ] Two worktrees run `bun run test:e2e` at the same time and each tests its own code.
- [ ] `bun run test:pwa` and `bun run test:parity` still pass.
- [ ] The `ship` and `verify-chalk` skills describe the new port behavior.
