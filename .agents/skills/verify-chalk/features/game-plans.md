# Game plans

A Coach builds a Game Plan for one game from the Plays in his library, gives each Call a number, and prepares the plan. Preparing freezes a revision that the call sheet reads. The plan is kept on the device.

## Sub-features

- `plans-create` makes a named plan with an opponent.
- `plans-add` adds Plays from the library after stating how many new Calls that makes.
- `plans-number` gives each Call a number and refuses a number already in the plan.
- `plans-prepare` freezes a Prepared Revision.
- `plans-sheet` opens the call sheet for the prepared plan in a new window.
- `plans-persist` shows the plan, its numbers and its prepared state after a reload.

## How to get to it (user POV)

- Choose `Playbooks` in the header, then `Game plans` in the open book's pages. This is the only way in.

## Driving it with chalk-verify

Preconditions:

- `$V doctor` reads `ok` on every line.
- The starter Playbook is open, so the library holds `Stick — Thunder` and `Four Verticals`.

The spec `tests/e2e/game-plans.spec.ts` drives every sub-feature. Run `$V drive tests/e2e/game-plans.spec.ts`.

- **Open.** Run `const workspace = await openGamePlans(page)` from the fixtures. A region named `Game plans` is visible.
- **Create.** Run `workspace.getByRole("button", { name: "New plan" }).click()`, fill `workspace.getByLabel("Plan name")` with `Week 3` and `workspace.getByLabel("Opponent")` with `Central`, then run `workspace.getByRole("button", { name: "Create plan" }).click()`. A button named `Openers` appears.
- **Add.** Check `workspace.getByRole("checkbox", { name: /^Stick — Thunder$/ })` and `workspace.getByRole("checkbox", { name: /^Four Verticals/ })`. `workspace.locator("[data-preview]")` contains `2 new calls`. Run `workspace.getByRole("button", { name: /^Add 2 to plan/ }).click()`.
- **Number.** The fields are `workspace.getByLabel(/^Call number for/)`. Fill the first with `12` and press `Enter`. Fill the second with `12` and press `Enter`. The text `already a call in this plan` appears. Fill the second with `7`.
- **Prepare.** Run `workspace.getByRole("button", { name: "Prepare for game" }).click()`. Text starting `Prepared` appears.
- **Call sheet.** Wait for `page.waitForEvent("popup")`, then run `workspace.getByRole("button", { name: "Call sheet" }).click()`. The popup's body contains `Week 3`, `12` and `Stick — Thunder`.
- **Persist.** Run `page.reload()`, open game plans again, and choose the button whose name starts `Week 3 `. The first number field reads `12` and the text starting `Prepared` is there.
- **Proof.** The spec writes `game-plan-editor.png` with the prepared plan on screen.

## Gotchas

- The call sheet opens in a new window. Start waiting for the popup before the click, or the event is missed.
- A number field commits on `Enter`. Filling it without `Enter` saves nothing.
- A duplicate number is refused with the message `already a call in this plan`. Give the Call another number before you prepare.
- Editing a Play after Prepare for game marks the plan as behind its revision. The call sheet keeps reading the frozen revision.
- On a narrow header the views are a combobox named `Workspace view`. `chooseWorkspaceView(page, "Playbooks")` handles both.
