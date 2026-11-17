# Routes

A Coach selects a man and draws his route on the field one break at a time. The finished route is one step in the undo history and is saved on the device.

## Sub-features

- `routes-draw` starts a route from the selected man's inspector and places breaks with clicks.
- `routes-finish` ends the route on `Enter` and leaves it selected.
- `routes-save` shows the play as saved on this device.
- `routes-undo` removes the route with one Undo.

## How to get to it (user POV)

- Select a man on the field, then choose `Route` under Draw by hand in the inspector.
- Select a man, then drag from the blue dot beside him.

## Driving it with chalk-verify

Preconditions:

- `$V doctor` reads `ok` on every line.
- The starter Playbook is open on `Stick — Thunder`, which has 11 men and 6 routes.

The spec `tests/e2e/editor-interaction.spec.ts` drives every sub-feature from the inspector entry and the blue-dot entry. Run one test with `$V drive tests/e2e/editor-interaction.spec.ts -- -g "draws a route from the selected man"`. Run the whole file without `-g`. It has 65 tests.

- **Select a man.** Click the quarterback. Read his `transform` from `page.locator('[data-scene-player="q"]')`, convert it to client coordinates with the `playerCenter` helper in the spec, then run `page.mouse.click(x, y)`. His element takes the class `selected`.
- **Start the route.** Run `page.getByRole("group", { name: "Draw by hand" }).getByRole("button", { name: /^Route/ }).click()`. A path matching `[data-drawing-preview]` follows the pointer.
- **Place breaks.** Run `page.mouse.click(x, y - 60)`, then `page.mouse.click(x + 70, y - 60)`. The preview's `d` attribute gains a segment for each click.
- **Finish.** Run `page.keyboard.press("Enter")`. The preview is gone and `page.locator("[data-scene-path]")` counts 7.
- **Saved.** `page.getByRole("button", { name: "Saved on this device" })` is visible.
- **Undo.** `page.getByRole("button", { name: "Undo" })` has the title `Undo Draw route`. Click it. The path count returns to 6.
- **Proof.** Call `capture` after the finish and after the undo. The first screenshot shows the new route from the quarterback. The second shows the play without it.

## Gotchas

- The field is an SVG, and its men and routes have no ARIA role. Use `[data-scene-player="<id>"]` and `[data-scene-path]`.
- A man's `transform` is in the field's own coordinates. Convert through the SVG's `viewBox` and bounding box before you click, as `fieldPoint` in the spec does. Client coordinates change when a panel opens.
- Snap holds a break to a 10 degree step. A preview can sit a fraction of a pixel from the pointer, so match the start of its `d` attribute, not the whole string.
- Below 1024px the inspector is a drawer that starts closed. Open it with the button named `Inspector` before you look for Draw by hand.
- `Escape` abandons a route in progress and adds nothing to the undo history.
