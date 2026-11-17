# Defensive calls

A Coach picks a Defensive call from the Defenses browser and Chalk stands its eleven defenders on the field with the lines they run. On an offensive Play the defense is the Shadow. Settings can hold the corners and deep safeties at depths the Coach chooses.

## Sub-features

- `defense-open` opens the Defenses browser from each entry point.
- `defense-apply` puts a call's eleven defenders on the field with their assignments.
- `defense-depths` stands corners and deep safeties at the depths set in Settings.
- `defense-as-drawn` returns the men to the call's own depths.

## How to get to it (user POV)

- Press `Ctrl+Shift+D` in the editor.
- Choose the `Shadow defense` row under This play in the sidebar, then the call row in the popover it opens.
- Choose `New play` in the header, then `New defensive play`. The new play opens on the Defenses browser.
- For the depths, choose `Settings` at the foot of the sidebar, then the `Playbook` tab.

## Driving it with chalk-verify

Preconditions:

- `$V doctor` reads `ok` on every line.
- The starter Playbook is open on `Stick — Thunder` with `openSeededEditor(page)`.

The spec `tests/e2e/coverage-defaults.spec.ts` drives all four sub-features from the keyboard entry. Run `$V drive tests/e2e/coverage-defaults.spec.ts`.

- **Keyboard entry.** Run `page.keyboard.press("Control+Shift+d")`. A dialog named `Defenses` appears.
- **Sidebar entry.** Run `page.getByRole("navigation", { name: "Sidebar" }).getByRole("button", { name: /^Shadow defense/ }).click()`, then `page.getByRole("group", { name: "Shadow defense" }).getByRole("button", { name: /^No defense yet/ }).click()`. The same dialog appears.
- **With assignments.** The toggle `browser.getByRole("button", { name: "With assignments" })` must have `aria-pressed="true"`. Click it if it does not.
- **Apply.** Run `browser.getByRole("textbox", { name: "Search defenses" }).fill("4-3 Cover 3")`, then `browser.getByText("4-3 Cover 3", { exact: true }).click()`. The dialog closes and `page.locator("[data-scene-player]")` counts 22.
- **Set depths.** Open Settings with `openSettings(page)`, then run `settings.getByRole("tab", { name: "Playbook" }).click()`. In `settings.getByRole("group", { name: "Coverage defaults" })`, set the comboboxes `Corners off the ball` and `Deep safeties off the ball` with `selectOption({ label: "Press — 1 yard" })` and `selectOption({ label: "14 yards" })`. Close with `settings.getByRole("button", { name: "Close" }).click()`.
- **Read a depth.** A defender is `page.locator('[aria-label="C defense player"]')`. The spec's `yardsOff` helper turns his `transform` into yards off the ball. After the depths above and a new call, each corner is 1 yard off and the free safety is 14.
- **As drawn.** Set both comboboxes to `As the call draws it` and put the call on again. The corners return to the call's own depth.
- **Proof.** The spec writes `1-cover-3-press-and-14.png`, `2-bear-cover-0-pressed.png` and `3-cover-3-as-drawn.png`, each a screenshot of the field alone.

## Gotchas

- A depth setting applies when a call is put on. Put the call on again after you change a setting.
- A call with help deep leaves men in man coverage at the call's own spot. Only Cover 0 lines pressed corners up on their receivers.
- The sidebar row's name includes the current call. On a play with no defense it is `Shadow defense, No defense yet`.
- The sidebar row opens a popover, not the browser. The browser is one more click.
- A play with a defense has 22 men. Count `[data-scene-player]` to confirm both sides are on the field.
