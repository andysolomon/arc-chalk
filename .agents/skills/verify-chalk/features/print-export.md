# Print and export

A Coach chooses what to print, chooses a format, checks the preview, and prints. The workflow states the source, the count and the paper before anything prints. It explains an empty source, and it says why a format cannot take a source.

## Sub-features

- `output-open` opens the Print & export menu and the print preview.
- `output-source` switches between the current play, selected plays and a game plan.
- `output-empty` blocks printing an empty selection and says why.
- `output-format` switches format and updates the preview and the page count.
- `output-layout` lays out the coordinator call sheet by sides and section titles.
- `output-wristband` builds wristband inserts from the plan's calls at a chosen size.
- `output-print` sends the sheet to print and lists it under Recent.

## How to get to it (user POV)

- Choose `Print & export` in the header, then `Print preview`.
- Choose `Print & export` in the header, then a single output such as `Download PNG`, `Download SVG` or `Install page`.

## Driving it with chalk-verify

Preconditions:

- `$V doctor` reads `ok` on every line.
- The starter Playbook is open.
- For a game plan source, a plan named Week 3 holds two numbered Calls and is prepared. The spec builds it first. See [Game plans](./game-plans.md).

The spec `tests/e2e/output-workflow.spec.ts` drives every sub-feature from the Print preview entry. Run `$V drive tests/e2e/output-workflow.spec.ts`. The specs `tests/e2e/book-print.spec.ts` and `tests/e2e/playbook-print-identity.spec.ts` cover a whole Playbook.

- **Open.** Run `page.getByRole("banner").getByRole("button", { name: "Print & export", exact: true }).click()`, then `page.getByRole("button", { name: "Print preview", exact: true }).click()`. A region named `Print & export` appears. Its status named `What prints` reads `Current play: Stick — Thunder`.
- **Empty source.** Run `output.getByRole("radio", { name: "Selected plays" }).click()` and uncheck `Stick — Thunder` in the list named `Plays to pick`. An alert reads `Pick at least one play.` and the button `Print…` is disabled.
- **Game plan source.** Run `output.getByRole("radio", { name: "Game plan" }).click()`, then `output.getByRole("button", { name: /^Coordinator call sheet/ }).click()`. The status reads `Game plan: Week 3 · Offense · 2 plays`, `prepared` and `Letter landscape · 0.4 in margins`.
- **Preview.** The sheet is `page.frameLocator('iframe[title="Preview"]')`. Its body contains `Week 3` and `12`.
- **Layout.** In `output.getByRole("group", { name: "Call sheet layout" })`, click `Two sides`. The preview contains `Side 1 of 2` and the status reads `2 pages`.
- **Wristband.** Click the format button starting `Wristband`. In the group `Wristband inserts`, the list `Calls on the band` has 2 items. Select `3x1.5-1x3` in `Size preset`. The preview contains `print at 100 % (Actual size)`.
- **Wrong source.** Click the format button starting `Install page`. An alert reads `Install page is built from the current play or selected plays, not a game plan.`
- **Print.** Run `output.getByRole("button", { name: "Print…" }).click()`. The status named `Outcome` reads `Sent to print.`
- **Recent.** Press `Escape`, open `Print & export` again. Under `RECENT` there is a button named `Coordinator call sheet — game plan`.
- **Proof.** The spec writes `output-workflow.png` with the status and the preview on screen.

## Gotchas

- Headless Chromium does not print. The proof is the preview frame's text and the `Sent to print.` status.
- The preview is an iframe. An init script runs in it too, so a script that clears storage must return early when `window !== window.top`.
- The binder's page numbers fill in after the preview measures its layout. Wait for `[data-contents-for] .tp` to hold a number before you read the count.
- A format that takes one play does not change the source. The status keeps reading `Game plan: Week 3`.
- A download is evidence only when the journey saves it with `download.saveAs(testInfo.outputPath(...))`.
