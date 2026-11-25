# Chalk verification map

This folder is the maintained source for verifying what a Coach can do in Chalk. Read this index before you drive the app, then use the matching feature file as the recipe.

## Baseline

- Run every command from the repo root with `V="bun .agents/skills/verify-chalk/scripts/chalk-verify.ts"`.
- Run `$V launch`, then `$V doctor`. Every doctor line must read `ok`.
- Never drive an instance this checkout did not launch.
- Each test starts on a clean device. The fixture's `page.goto("/")` and `openSeededEditor(page)` open the starter Playbook on the play `Stick — Thunder`. `openBlankEditor(page)` opens an empty library on Untitled play.
- The app runs signed out with no cloud. Nothing needs a network.

## Driving conventions

- Drive with `$V drive <spec or journey>`. Each feature file names the specs that already drive it.
- Find controls by ARIA role and accessible name. Marks on the field have no role, so use their `data-scene-*` attributes.
- Run `$V look` to print the roles and names on a screen before you write a locator.
- Use the words in `CONTEXT.md` for what you see: Coach, Playbook, Play, Formation, Defensive call, Game Plan.
- A phone has a different header and puts the sidebar in a drawer. `playNameField`, `headerCommand` and `chooseWorkspaceView` in `tests/e2e/fixtures.ts` find a control on either layout.

## Proof and skip reporting

- Capture the action and the state it leaves. The last screen alone is not proof.
- Proof of something on screen is a screenshot and the ARIA tree from `capture`.
- Proof of something saved is a second look after `page.reload()`.
- Proof of something printed is the text of the `iframe[title="Preview"]` frame.
- Proof of an export is the file saved with `download.saveAs(testInfo.outputPath(...))`.
- Record the sub-feature ID and the entry point with each result.
- Report a path you could not reach with the command you tried and the reason.
- Do not report an entry point as verified because a different one passed.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph on what the Coach sees. It then has four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every entry point.
3. `Driving it with chalk-verify` starts with `Preconditions:` and pairs each Coach action with the exact locator and the result to expect.
4. `Gotchas` lists what can waste or invalidate a run.

Keep implementation details out of the map. Name Coach paths, stable locators, required state, commands and what proves the result.

## Features

- [Formations](./formations.md) covers the Formations browser, its filters, putting a set on the field, and the left-handed twin.
- [Routes](./routes.md) covers drawing a route for a selected man, finishing it, and undoing it.
- [Defensive calls](./defensive-calls.md) covers the Defenses browser, putting a call on the field, and the coverage depth settings.
- [Game plans](./game-plans.md) covers building a plan from the library, numbering calls, preparing it, and keeping it across a reload.
- [Print and export](./print-export.md) covers choosing a source and a format, the preview, and sending to print.

## Not mapped yet

Playback and Present, Share Links, Playbook pages, versions, appearance settings and the offline shell have specs in `tests/e2e` and no feature file. Add a file here when you first verify a change to one of them.
