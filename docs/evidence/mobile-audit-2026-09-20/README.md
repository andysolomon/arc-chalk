# Mobile readiness — phone regression record

Automated phone coverage lives in `tests/e2e/phone-*.spec.ts` and runs on two
phone-shaped Playwright projects (`phone-chromium`, an Android-like Chromium
with touch; `phone-webkit`, an iPhone-like WebKit). Each spec walks the
widths that matter — 360×800, 390×844, 430×932 and 844×390 — with touch and
mobile emulation. A failed phone test keeps its screenshot and trace under
`test-results/`, and the report's metadata carries the git SHA the run built
from (`metadata.buildSha` in `playwright.config.ts`).

## What the phone specs cover

| Spec | Workflow |
| --- | --- |
| `phone-editor.spec.ts` | Status controls on the glass and zoom by tap (#98); Fit the field inside the stage (#99); the phone workspace — header, tray, sheet, notices, reading shell (#92); blank first launch → formation → name → route → save → reload (#96, #97). |
| `phone-game-day.spec.ts` | Populated plan with long names → prepare → Game Day → fold, code/name, diagram, Previous/Next, section return, favorites, search, rotation, reload (#93, #95). |
| `phone-plans.spec.ts` | Plan create → fill → add calls → reorder → prepare → outputs → rename → back → row actions; browser head search, tabs, close and star; coarse-pointer sizing (#94, #95). |

Every bound is asserted on element boxes against the viewport, not on
`documentElement.scrollWidth` alone, so content clipped inside an
overflow-hidden container is caught.

## Captures

The `after-*.png` files are Chromium emulation captures of the phone
workspace at 360×800, 390×844 and 844×390 (editing, with an injected pending
update notice) and the reading shell at 400×496, taken on branch
`feat/92-phone-workspace`.

## Physical-device checks — NOT PERFORMED

Viewport emulation is not hardware validation. The following were **not**
run and remain owed before this coverage counts as release evidence:

- iPhone Safari (iOS 17+): software keyboard over the play-name field and the
  game-plan forms; browser-bar collapse on scroll; Add to Home Screen
  (installed mode) launch; offline reload; background → resume with an
  unsaved edit.
- Android Chrome (14+): the same five checks.

Record each as pass / fail with the device, OS, build SHA and date here when
they are done.
