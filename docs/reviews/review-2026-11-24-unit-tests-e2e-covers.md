# Unit tests an end-to-end spec already covers

This pass deletes 17 Vitest cases. Each one asserts a behavior that a named Playwright test in `tests/e2e` also asserts through the app. It follows the standard of #124 and #141 and holds it tighter. A case went only when the end-to-end test checks every assertion the case makes. A case whose title the spec covers went only when the spec also covers its second scenario, its exact number and its sideline check.

## Method

1. An earlier inventory named 26 whole files and 12 mixed files as candidates, judged from their titles.
2. Each candidate case was read in full. Its assertions were matched against the spec tests that drive the same feature.
3. A case was kept when it guards security, privacy, legal or retention behavior. Isolation tests that AGENTS.md allows were kept too: migrations, interrupted writes, sync, geometry edge cases, pagination and clamps. Tests of queues, promise chains and lifecycles were kept.
4. For each case a fix commit added, `git log -S '<title>'` found the commit. The table names the spec test that the same commit added to replay the same bug.
5. Three deletions from three areas were proven. The product code was broken, the spec was driven with `verify-chalk`, and the code was restored.

## What was deleted

| Unit case                                                                                                                             | Covering spec and test                                                                                                                                                         | Added by                       |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `tests/editor/play-verbs.test.ts` `spreads them evenly between the two widest, who do not move`                                       | `tests/e2e/arrange-menu.spec.ts` "Arrange looks like a menu and only offers legal rearrangements"                                                                              | #33                            |
| `tests/editor/motion-calls.test.ts` `retypes the motion he has instead of adding a second`                                            | `tests/e2e/motion-panel.spec.ts` "a man is given a motion by type, and its panel is three choices"                                                                             | #215                           |
| `tests/editor/motion-calls.test.ts` `takes Moving or Set from the type, not from the one it replaced`                                 | `tests/e2e/motion-panel.spec.ts` "a man is given a motion by type, and its panel is three choices"                                                                             | #215                           |
| `tests/editor/motion-calls.test.ts` `puts his route back on his stance when the motion is taken off`                                  | `tests/e2e/motion-panel.spec.ts` "his route follows the motion, and goes back when it is taken off"                                                                            | #215                           |
| `tests/domain/positions.test.ts` `makes the I-Form's H the tailback and its F the fullback, among the backs`                          | `tests/e2e/football-metadata.spec.ts` "an I-Form play is 21 personnel in the editor and on the printed page, with a tailback and a fullback"                                   | fix #179, which added the spec |
| `tests/domain/positions.test.ts` `reads the Strong set off the stance too: the deep F is the tailback and the offset H the fullback`  | the same I-Form test, at Strong Right                                                                                                                                          | fix #179                       |
| `tests/domain/positions.test.ts` `puts the nickel in the secondary and the deep S among the safeties (Nickel Cover 2)`                | `tests/e2e/football-metadata.spec.ts` "a nickel call files the nickel and the deep safety in the secondary, and tells the two S apart"                                         | fix #179                       |
| `tests/domain/positions.test.ts` `tells the two S of 4-3 Cover 2 apart: the Sam in the box, the strong safety deep`                   | the same nickel test, at 4-3 Cover 2                                                                                                                                           | fix #179                       |
| `tests/domain/positions.test.ts` `fields the Bear's four defensive backs as two corners and two safeties, each with his own letter`   | `tests/e2e/football-metadata.spec.ts` "the Bear front letters every man once, and reads its four defensive backs as corners and safeties"                                      | fix #179                       |
| `tests/domain/run-game.test.ts` `reads a power right off the down blocks, not the way they move`                                      | `tests/e2e/run-game.spec.ts` "pulls on a power right go right, and the fullback kicks out upfield"                                                                             | fix #169, which added the spec |
| `tests/domain/run-game.test.ts` `is where his motion leaves him`                                                                      | `tests/e2e/run-game.spec.ts` "a jet motion leads into the sweep as one path"                                                                                                   | fix #169                       |
| `tests/domain/man-coverage.test.ts` `covers every receiver it can before doubling one, and leaves the extra man free`                 | `tests/e2e/man-coverage.spec.ts` "gives each man his receiver in Cover 1 without moving him, until the call becomes Cover 0"                                                   | #142                           |
| `tests/domain/defensive-field.test.ts` `puts a spy five to seven yards off the ball over the quarterback, not at the spy's own depth` | `tests/e2e/defensive-landmarks.spec.ts` "sends a backer through a named gap past the line, games the front in pairs, and spies over the quarterback"                           | fix #170, which added the spec |
| `tests/domain/defensive-hash.test.ts` `reads the right hash off a front the hash squeezed`                                            | `tests/e2e/defensive-hash.spec.ts` "spots the ball on a hash and takes the defense with it, call and all"                                                                      | fix #184, which added the spec |
| `tests/domain/motion-calls.test.ts` `shifts a wide receiver in toward the ball`                                                       | `tests/e2e/motion-panel.spec.ts` "a man is given a motion by type, and its panel is three choices"                                                                             | #215                           |
| `tests/domain/zone-shell.test.ts` `gives Deep 1/4 the quarter nearest the man: outside for a corner, inside for a safety`             | `tests/e2e/zone-shell.spec.ts` "draws Cover 4 and Cover 6 from quick assignments, and lays two men called to one landmark side by side"                                        | #194                           |
| `tests/exports/coaching-outputs.test.ts` `reads personnel, formation, strength and hash off the men`                                  | `tests/e2e/football-metadata.spec.ts` "an I-Form play is 21 personnel in the editor and on the printed page, with a tailback and a fullback", on the install page's `.mt` line | #53                            |

## What stayed, and why

No whole file qualified. Every whole-file candidate has at least one case the specs do not reach.

- **Clamps and geometry edge cases.** `editor/camera`, `editor/stylus`, `editor/tackle-box-snapping`, the sideline and line-of-scrimmage holds in `field-interaction`, and the seam and spill cases in `zone-shell` stayed. AGENTS.md allows these.
- **Pagination, stored layouts and escaping.** `exports/book`, `call-sheet`, `wristband`, `game-plan-documents`, `output-catalog` and `output-workspace` paginate, read stored layouts back within bounds, or escape names. The specs print one or two sheets and check page counts, not the mapping from a play to its page number.
- **Lifecycles and in-flight state.** `output-workspace` and `game-plans-workspace` check a packet read that is still in flight and a save that has not landed.
- **A second scenario the spec skips.** Examples are the reduced-motion jump and the speed change in `editor/playback`, the defender guard in `drawing-kind`, the Scout card and Playbook page markings in `render/presentation`, and the emphasis fade in `render/emphasis`. The others are the Align depth move in `play-verbs`, the alignment resets in `domain/alignment-reset`, the side-by-side ownership rules in `play-erasures` and the unlettered readings in `positions`.
- **An assertion the spec leaves out.** The spec asserts the safety's curl/flat depth but not where it lands across the field. The spec names the Jet but never checks that it is drawn as a zigzag. The spec clips Half field to seven yard lines but never checks which seven.

## Proof that the specs catch the deleted behavior

Each proof broke one line of product code and drove the covering spec with `bun .agents/skills/verify-chalk/scripts/chalk-verify.ts drive <spec> -- -g "<test>" --retries=0 --timeout=180000`. The long timeout is there because the machine ran at a load average near 50. The 30-second default timed out on clean code. Each spec passed on clean code first. Each break also failed the unit case this change deletes. The code was restored after each run.

### Editor: a motion takes Moving or Set from its type

```diff
-  if (call.atSnap === "moving") drawn.atSnap = "moving";
+  if ((existing?.atSnap ?? call.atSnap) === "moving") drawn.atSnap = "moving";
```

`packages/editor/src/field/commands.ts`. Clean run `20261124-075115` passed. Broken run `20261124-075354` failed:

```text
✘ tests/e2e/motion-panel.spec.ts:81:1 › a man is given a motion by type, and its panel is three choices
Locator:  getByRole('complementary', { name: 'Play inspector' }).getByRole('group', { name: 'At the snap' }).getByRole('button', { name: 'Set' })
Expected: "true"
Received: "false"
> 183 |   await expect(snap.getByRole("button", { name: "Set" })).toHaveAttribute(
```

Vitest on the same break failed `takes Moving or Set from the type, not from the one it replaced`.

### Domain: the deeper of two backs is the tailback

```diff
-    words.set(deepest.id, "Tailback");
+    words.set(deepest.id, "Fullback");
-    words.set(shallowest.id, "Fullback");
+    words.set(shallowest.id, "Tailback");
```

`packages/domain/src/positions.ts`. Clean run `20261124-075616` passed. Broken run `20261124-075905` failed:

```text
✘ tests/e2e/football-metadata.spec.ts:122:1 › an I-Form play is 21 personnel in the editor and on the printed page, with a tailback and a fullback
  Array [
    "Q: No assignment yet — Quarterback",
-   "F: No route yet — Fullback",
-   "H: No route yet — Tailback",
+   "F: No route yet — Tailback",
+   "H: No route yet — Fullback",
  ]
> 139 |     .toEqual([
```

Vitest on the same break failed `makes the I-Form's H the tailback and its F the fullback, among the backs` and `reads the Strong set off the stance too`.

### Exports: the printed page names the set off the men

```diff
-    formation: formation?.name ?? "Custom alignment",
+    formation: "Custom alignment",
```

`packages/exports/src/coaching-rows.ts`. Broken run `20261124-080353` failed:

```text
✘ tests/e2e/football-metadata.spec.ts:122:1 › an I-Form play is 21 personnel in the editor and on the printed page, with a tailback and a fullback
Locator: locator('iframe[title="Preview"]').contentFrame().locator('.mt span')
  Array [
    "21P",
-   "I-Form Right",
+   "Custom alignment",
    "strength right",
    "middle hash",
  ]
> 159 |   await expect(install.locator(".mt span")).toHaveText([
```

Vitest on the same break failed `reads personnel, formation, strength and hash off the men`.

Every run folder is under `.verify/runs/`, with a video, a trace and the failing screenshot. Git ignores that folder, so a reviewer regenerates the runs with the commands above.
