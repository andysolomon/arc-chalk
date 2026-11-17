# Formations

A Coach picks a Formation from a browser and Chalk stands its eleven men on the field. The status bar under the field names the set and its personnel.

## Sub-features

- `formations-open` opens the Formations browser from each entry point.
- `formations-filter` narrows the list with a Personnel chip, a Set chip or the search box.
- `formations-apply` puts the chosen set's eleven men on the field and names it in the status bar.
- `formations-twin` puts on the left-handed twin and moves the wing to the other side.

## How to get to it (user POV)

- Press `Ctrl+Shift+F` in the editor.
- Choose the `Formation` row under This play in the sidebar.
- Choose `New play` in the header, then `New offensive play`. The new play opens on the Formations browser.

## Driving it with chalk-verify

Preconditions:

- `$V doctor` reads `ok` on every line.
- The editor is open on an empty library with `openBlankEditor(page)`.

The spec `tests/e2e/goal-line-formation.spec.ts` drives `formations-open` by keyboard, `formations-filter`, `formations-apply` and `formations-twin`. Run `$V drive tests/e2e/goal-line-formation.spec.ts`.

- **Keyboard entry.** Press the shortcut. Run `page.keyboard.press("Control+Shift+f")`. A dialog named `Formations` appears.
- **Sidebar entry.** Choose the row. Run `page.getByRole("navigation", { name: "Sidebar" }).getByRole("button", { name: /^Formation,/ }).click()`. The same dialog appears.
- **New play entry.** Run `page.getByRole("banner").getByRole("button", { name: "New play", exact: true }).click()`, then `page.getByRole("group", { name: "New play" }).getByRole("button", { name: /^New offensive play/ }).click()`. The same dialog appears.
- **Filter by set.** Choose the Goal line chip. Run `browser.getByRole("button", { name: "Goal line", exact: true }).click()`. One group heading remains, and it contains `Goal line · heavy`.
- **Apply.** Choose a set. Run `browser.getByText("Goal Line Right", { exact: true }).click()`. The dialog closes and `page.locator("[data-scene-player]")` counts 11.
- **Status.** Press `Escape` to clear the selection. `page.locator("[data-formation-status]")` reads `GOAL LINE RIGHT · 22`.
- **Twin.** Reopen the browser, choose the Goal line chip, then run `browser.getByText("Goal Line Left", { exact: true }).click()`. The status reads `GOAL LINE LEFT · 22` and the man lettered Z stands on the other side of the quarterback.
- **Proof.** The spec writes `goal-line-right.png` and `goal-line-left.png` to the run folder. Both show the field with the set on it.

## Gotchas

- The browser closes itself when a set is chosen. Close it unpicked with `browser.getByTitle("Close — esc").click()`.
- Choosing a set leaves the men selected. Press `Escape` before you read the status bar or take the screenshot.
- The sidebar row's accessible name includes the current alignment, such as `Formation, Custom alignment`. Match it with `/^Formation,/`.
- On a phone the sidebar is a drawer. Open it with `page.getByRole("button", { name: "Open the sidebar" }).click()` before you look for the row.
