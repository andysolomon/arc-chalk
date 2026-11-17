---
name: demo-kit
description: Demo a Chalk feature. Films the feature working in the real app with captions, draws one diagram of how it works, and builds a page that holds the film, the steps and the diagram. Use for /demo-kit, "demo this feature", "show me a demo of X", "make a demo for the PR", or when a finished feature needs something a person can watch.
---

# Demo kit

A demo kit is one folder a person can open to see a feature work. Build one whenever someone asks for a feature to be demoed.

```text
.demo-kit/<slug>/
  index.html            the page: film, steps, diagram, how to try it
  walkthrough.mp4       the film, with a caption under each step
  step-01.png ...       the screen after each step
  diagram.html          the diagram, from the Diagram Design skill
  diagram.svg           the same diagram, exported for the page
  kit.json              the page's copy
  walkthrough.demo.ts   the script that films it
  recording.json        the step times, the commit and the date
```

Git ignores `.demo-kit/`. The film comes from the real app in Chromium, driven through the instance that the `verify-chalk` skill launches. Every command runs from the repo root.

```sh
V="bun .agents/skills/verify-chalk/scripts/chalk-verify.ts"
D="bun .agents/skills/demo-kit/scripts/demo-kit.ts"
```

## Build a kit

### 1. Learn the feature

Read what the feature does before you film it.

- Find its file in `.agents/skills/verify-chalk/features/`. It lists each way a Coach reaches the feature and the locators that drive it.
- Read the spec in `tests/e2e` that covers it, and the pull request or commit that shipped it.
- Use the words in `CONTEXT.md`. A Coach owns a Playbook. A Play is not a drawing.

Pick the one path a Coach would take first. A kit shows one path well. It is not a tour of every option.

### 2. Launch the app

```sh
$V launch
$V doctor
```

Film nothing until doctor prints `ok` on every line.

### 3. Start the kit

```sh
$D new goal-line-formations
```

The slug is lower-case letters, digits and hyphens. The command writes a starter `kit.json` and `walkthrough.demo.ts`.

### 4. Write the walkthrough

The walkthrough is a Playwright test with one `d.beat` for each step.

```ts
import {
  demo,
  expect,
  openBlankEditor,
  test,
} from "../../.agents/skills/demo-kit/scripts/demo";

test("goal line formations", async ({ page }, testInfo) => {
  const d = await demo(page, testInfo);
  await openBlankEditor(page);
  const browser = page.getByRole("dialog", { name: "Formations" });

  await d.beat(
    "Open the Formations browser",
    async () => {
      await d.press("Control+Shift+f");
      await expect(browser).toBeVisible();
    },
    { detail: "The Formation row in the sidebar opens the same browser." },
  );

  await d.beat("Choose the Goal line chip", async () => {
    await d.click(
      browser.getByRole("button", { name: "Goal line", exact: true }),
    );
    await expect(browser.locator(".browser-group-head")).toHaveCount(1);
  });
});
```

Call `demo(page, testInfo)` first, before the page opens. Step times count from that call.

| Call | What the viewer sees |
|---|---|
| `d.beat(caption, actions, { detail })` | The caption goes up, the actions run, the result holds, and a screenshot is saved. |
| `d.click(locator)` | The pointer travels to the control, then clicks it. |
| `d.clickAt(x, y)` | The pointer travels to a point on the field, then clicks. |
| `d.type(locator, text)` | The text appears one key at a time. |
| `d.press(combo)` | The key is pressed and named at the right of the caption band. |
| `d.pause(ms)` | The screen holds, for a result that needs longer. |

Hold a walkthrough to these rules.

- Use three to six beats. Each beat is one thing a Coach does and the result he sees.
- Write the caption as what the Coach does. Keep it under 64 characters, or `record` refuses it.
- Put one more sentence in `detail` when the result needs explaining. The page shows it and the film does not.
- Put an `expect` in every beat. A film of a broken feature must fail, not ship.
- Use `d.click` and `d.press` for what the viewer should follow. Use plain Playwright calls for setup the viewer does not need.
- Do what a Coach does. Do not set state with `page.evaluate`.
- Run `$V look` to find the roles and names on a screen. See the `verify-chalk` skill.

### 5. Film it

```sh
$D record goal-line-formations
```

Record drives the walkthrough at 1280×800, trims the film to the steps, and adds a band under it with the caption, the step number and each key pressed. It writes `walkthrough.mp4`, `poster.png`, the step screenshots and `recording.json`.

Then read every `step-NN.png`. Each one must show the result its caption names. Fix the walkthrough and record again until they do.

### 6. Draw the diagram

Every kit has one diagram, and the Diagram Design skill draws it. Load that skill and follow it. Do not draw the diagram any other way.

- The repo's `.diagram-design` file selects the `chalk` profile, so the diagram uses Chalk's colors. If the skill reports that profile missing, copy `docs/design/diagram-design-chalk-profile.md` to `~/.diagram-design/profiles/chalk.md` and try again.
- Draw what the film cannot show. That is the rule behind the feature, the choice the Coach makes, the states a thing moves through, or where the data goes. Do not redraw the screen.
- Let the skill choose the type from its own guide. State the type and the plan before you draw, as the skill asks.
- Save the result as `.demo-kit/<slug>/diagram.html`.
- Run the skill's check and export from the Diagram Design skill folder.

```sh
python3 <diagram-design skill folder>/scripts/self_check.py .demo-kit/<slug>/diagram.html
python3 <diagram-design skill folder>/scripts/export_svg.py .demo-kit/<slug>/diagram.html .demo-kit/<slug>/diagram.svg
```

`build` puts `diagram.svg` on the page under "How it works".

### 7. Write the copy

Fill in `kit.json`.

| Field | What to write |
|---|---|
| `title` | The feature's name as a Coach would say it. |
| `summary` | What a Coach can do now, in one or two sentences. |
| `where` | Where the feature is in the app, outermost first. |
| `tryIt` | The steps a Coach takes to try it, one sentence each. |
| `diagramCaption` | What the diagram shows, in one sentence. |

Read `.agents/skills/unslop/SKILL.md` and hold every sentence to it, captions and details included. Say what the feature does. Name the control, the number and the result. Cut any sentence that could describe another product.

Quote text exactly as the app shows it, in double quotes, when it holds a dash or a symbol. The Play named "Stick — Thunder" keeps its dash that way.

### 8. Build the page

```sh
$D build goal-line-formations
```

Build checks `kit.json`, the captions and the details against the unslop rules a script can check. It prints each finding and writes nothing until the copy is clean. A clean check does not replace step 7.

### 9. Look at the page

Open `.demo-kit/<slug>/index.html` in a browser and read it from top to bottom. Check that the film plays, each step shows the right screen, and the diagram is whole.

### 10. Show it

- In a chat that shows media, embed `walkthrough.mp4` by its full path and link `index.html`.
- Publish the kit so a person on the tailnet can open it.

```sh
$D serve goal-line-formations
```

Serve starts a file server on `127.0.0.1` for the kit folder, publishes it with `tailscale serve`, and prints an `https://<machine>.ts.net:<port>` address. Give the person that address.

Report the address, the kit folder, the commit that was filmed, and anything the kit leaves out.

### 11. Clean up

```sh
$V stop
$D stop goal-line-formations
```

`$V stop` ends the app instance. `$D stop` takes the kit off the tailnet and ends its file server. Leave the kit published while the person is still looking at it. Neither command deletes the kit folder.

## Film a kit again

A kit goes stale when the feature changes. Launch the app, then run `record` and `build` again. The walkthrough fails when a control it uses has changed, and the failure names the control.

## Helpers

| File | What it does |
|---|---|
| `scripts/demo-kit.ts` | `new`, `record`, `build`, `serve` and `stop`. Run it with `bun`. |
| `scripts/demo.ts` | The import for a walkthrough. It exports the repo's fixtures and `demo`. |
| `scripts/static-server.ts` | The file server that `serve` starts. |
| `assets/kit-template.html` | The page. Edit it to change how every kit looks. |
| `assets/walkthrough.demo.ts` | The starter walkthrough that `new` copies. |

## Gotchas

- **`record` needs a launched instance.** It fails with "no instance" until `$V launch` has run.
- **`ffmpeg` must be installed.** Record uses it to trim the film and draw the caption band.
- **A caption that the app also shows is safe.** Captions are drawn on the film after recording. They are never in the page, so a locator cannot match one.
- **The pointer dot is in the page.** It is one element with `aria-hidden`, no role and no text. It appears in step screenshots.
- **The film starts on a clean device.** `openBlankEditor` gives an empty library. `openSeededEditor` gives the starter Playbook.
- **The kit records the commit.** The page's footer names it and says when the app had uncommitted changes.
