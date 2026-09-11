# Empty defense guidance — Implementation Plan

**Mode:** Gap (empty-defense state exists; the next action is under-discoverable)
**Branch:** `cursor/empty-defense-guidance-9a27`
**Source:** Product discussion 2026-09-11 — blank defensive half vs coach-natural workflow
**Decision:** Option **A — field CTA** (locked 2026-09-11). Tracked as [ARC-182](https://linear.app/arcnology/issue/ARC-182/w-000089-add-a-field-cta-on-empty-defensive-half-to-open-defenses) / W-000089 in Linear `arc-chalk`.
**Parity:** Additive empty-state guidance only. Requires an explicit parity exception under ADR 0039 before any Coach-facing chrome ships.

## 1. Product goal and scope boundaries

### Goal

When a Play has offense on the field and no defenders, a Coach should immediately understand the intended next move: **pick a defensive call** (front + coverage), not invent freehand glyph placement. Empty defensive half remains a valid state — silence about what to do next does not.

### Product judgment (locked for this plan)

| Judgment | Implication |
| --- | --- |
| Coaches know football, not this UI | Do not rely on football literacy alone to discover Chalk's defense path |
| Empty top half reads as “no call yet,” not “draw defense freehand” | Keep empty as intentional; name it and route to the picker |
| Coaches think front + coverage | First action opens the existing Defenses browser (`⇧⌘D`) |
| Freehand (`Z`, Letter players) is expert path | Keep it; demote it behind “apply a call” |
| Do not auto-drop a stock defense | Never surprise-replace the diagram |

### In scope

- Detect “offense present, zero defenders” (and optionally fully empty field)
- Surface one clear Coach-voice CTA that opens the existing Defenses overlay
- Strengthen the inspector **No defense yet** control when it is the empty-state entry
- Status-bar / Demo-adjacent copy only if it stays in the established voice and density
- Tests + a recorded parity exception once product owner approves the surface

### Out of scope

- Redesigning the Defenses browser, catalogue, or apply semantics
- Auto-applying Cover 3 / Nickel / any default call
- Madden-style zone oval art, controller chrome, or play-card restyle
- Changing Formation empty states (offense already has a stronger picker habit)
- Onboarding tours beyond a single Demo caption tweak if needed
- Mobile-only layouts

## 2. Current baseline

Evidence from `main` @ `0e2bce6`:

| Surface | Behavior today |
| --- | --- |
| Field | Offense-only Plays show a blank defensive half with no canvas cue |
| Inspector Defense | Wide picker reads **No defense yet** / `–` and opens Defenses (`apps/web/src/components/chalk-app.tsx`) |
| Hint under Defense | “Each call replaces the last… Press Z to add your own drop.” |
| Shortcut | `⇧⌘D` opens Defenses (parity with original) |
| Status bar | Tool-centric hints only; no empty-defense branch (`editor-status-hint.ts`) |
| Demo `defense` tour | Teaches Letter players + `Z` zone drops, not “open the call book first” (`packages/domain/src/demo-catalogue.ts`) |
| Defenses overlay | Stock calls with thumbnails; apply leaves offense untouched (`editor-overlays.tsx`) |

**Gap:** The correct path exists in the inspector, but a Coach staring at the field (especially with the inspector collapsed) has no field-local next action.

## 3. Missing capabilities

1. **Field-local empty-defense affordance** that opens the same Defenses overlay as **No defense yet**
2. **Conditional status-bar line** when select-tool + zero defenders + offense present (optional, lower priority than canvas CTA)
3. **Demo / copy alignment** so the first defense step points at the call book before freehand
4. **Parity-exception record** documenting the additive empty-state chrome
5. **Automated coverage** for visibility rules and click → overlay

## 4. Milestones

### Milestone 1 — Decision lock & parity exception

**Goals:** Confirm the lightest approved surface before coding chrome.

**Deliverables:**
- ~~Owner picks surface~~ → **A locked** (field CTA on empty defensive half → opens Defenses)
- Linear work item: [ARC-182](https://linear.app/arcnology/issue/ARC-182/w-000089-add-a-field-cta-on-empty-defensive-half-to-open-defenses) (W-000089)
- ADR 0039 parity-exception note (new short ADR or amendment) still owed before chrome ships

**Dependencies:** Parity ADR text before merge of Coach-facing UI
**Risks:** Heavy overlay / dense chrome violates “smallest possible divergence”
**Acceptance criteria:**
- [x] Owner picks A, B, or C (or an explicit hybrid) → **A**
- [ ] Exception text names what is additive and what must not change
- [x] Tracked work item exists with this plan linked → ARC-182

### Milestone 2 — Empty-defense detection helper

**Goals:** One pure predicate/helper for “should show empty-defense guidance.”

**Deliverables:**
- Helper in editor/app layer, e.g. `emptyDefenseGuidance(document)` → `{ show: boolean; reason: "no-defense" | "custom-front" | "call-on-field" }`
- Rules (proposed):
  - `show` when `view === "editor"`, select tool (or any non-drawing tool TBD), defender count `=== 0`, and offense (or any non-defense) players `> 0`
  - Hide when Defenses/Formations/palette overlay open, Demo/Present/Print active, animating, or a defense call / custom front is on the field
- Unit tests for the predicate matrix

**Files (expected):**
- `apps/web/src/components/empty-defense-guidance.ts` (new)
- `apps/web/src/components/empty-defense-guidance.test.ts` (new)
- Possibly thin reuse of defender counting already inlined in `chalk-app.tsx`

**Dependencies:** Milestone 1 option (affects *where* `show` is consumed, not the predicate)
**Risks:** False positives on scout cards / special teams / drills with intentional zero defense
**Acceptance criteria:**
- [ ] Unit table covers offense-only, defense-only, both, empty, overlay-open, non-editor views
- [ ] Special-teams / drill ambiguity documented; default hide when `unit` mix is unclear if needed

### Milestone 3 — Coach-facing surface (approved option)

**Goals:** Make the next action obvious without teaching a new workflow.

#### Option A — Field CTA (preferred if approved)

**Deliverables:**
- Non-modal, low-chroma control anchored on the empty defensive half (or centered above the LOS on the defense side)
- Copy in Coach voice, e.g. **Add a defense** with secondary `⇧⌘D` / “opens the call book”
- Click / Enter activates existing `setOverlay("defenses")` / `onOpenDefenses`
- Dismissible for the session optional; must not persist as a permanent doc flag in v1 unless owner asks
- CSS in `apps/web/src/styles/app.css` matching existing density (Geist, `#8F8F8F` / `#0072F5`, 6px radius, no card stack)

**Files (expected):**
- `apps/web/src/components/chalk-app.tsx` — mount CTA over field when helper says show
- `apps/web/src/styles/app.css` — layout that does not steal pan/marquee except on the control itself
- `apps/web/src/components/chalk-app.test.tsx` — visibility + click opens defenses

#### Option B — Inspector only

**Deliverables:**
- Emphasize **No defense yet** (weight, helper line “Start with a call — Cover 3, Nickel, Fire Zone”)
- Ensure collapsed inspector stub still exposes a one-click path (e.g. stub action or status control)

#### Option C — Status bar only

**Deliverables:**
- Extend `editorStatusHint` / `EditorStatusHintInput` with empty-defense branch
- Copy: point at Defenses / `⇧⌘D`, not freehand first
- Tests in `editor-status-hint.test.ts`

**Dependencies:** Milestone 1 + 2
**Risks:** Canvas CTA fighting marquee / pan; copy sounding like CAD; violating parity density
**Acceptance criteria:**
- [ ] From an offense-only Play, a Coach can open Defenses in one obvious click without hunting
- [ ] Applying a stock call dismisses the empty guidance
- [ ] Offense, routes, and defense-apply semantics unchanged
- [ ] Keyboard: CTA is focusable; `⇧⌘D` still works
- [ ] Visual density matches surrounding chrome (manual screenshot vs current Editor)

### Milestone 4 — Demo / copy alignment (light)

**Goals:** Expert path stays available; first teaching beat matches the product judgment.

**Deliverables:**
- If Demo `defense` tour still opens on freehand-first, prepend or reword the first caption to “Open Defenses — pick a call, then draw coverage on top” **only if** owner approves Demo copy change (parity-sensitive)
- Inspector Defense hint: lead with call-book, keep `Z` as secondary

**Files (expected):**
- `packages/domain/src/demo-catalogue.ts` (only with approval)
- `apps/web/src/components/chalk-app.tsx` Defense section hint

**Acceptance criteria:**
- [ ] No Demo regression in `tests/parity` / Demo e2e without an explicit exception
- [ ] Hint still mentions `Z` for own drop

### Milestone 5 — Verification & ship

**Goals:** Prove the empty state teaches the call-book path.

**Deliverables:**
- Unit + component tests green
- E2E: offense-only fixture → CTA/hint visible → open Defenses → apply call → guidance gone (`tests/e2e/editor-shell.spec.ts` or `editor-interaction.spec.ts`)
- Manual walkthrough artifact (screenshot/video of offense-only → picker)
- Update parity matrix / exception list
- Archive plan docs on merge

**Acceptance criteria:**
- [ ] `bun run check` and targeted e2e pass
- [ ] Walkthrough artifact attached to PR
- [ ] `docs/empty-defense-guidance-*` moved to `docs/archive/` on merge

## 5. Out-of-scope / deferred

- Personalized “your last defense” quick apply
- Empty-offense guidance (Formation picker already stronger)
- Teaching coverage drawing beyond existing Demo / `Z` tool hint
- Changing Fire Zone / catalogue contents (handled elsewhere; ARC-173 done)
- Localization

## 6. Immediate next steps

1. ~~Get product-owner pick~~ → **A**
2. ~~Create Linear work item~~ → **ARC-182**
3. Record the ADR 0039 parity exception text.
4. Implement Milestone 2 helper + tests.
5. Implement Option A field CTA wired to existing Defenses overlay.

## Implementation task checklist (post-approval)

- [ ] **1. Parity exception + tracking**
  - Files: `docs/adr/00xx-empty-defense-guidance.md` (or amendment), tracker issue
- [ ] **2. Empty-defense guidance helper + unit tests**
  - Files: `apps/web/src/components/empty-defense-guidance.ts`, `*.test.ts`
- [ ] **3. Approved Coach-facing surface**
  - Files: `chalk-app.tsx`, `app.css`, and/or `editor-status-hint.ts` per option
- [ ] **4. Light copy / Demo alignment (if approved)**
  - Files: `chalk-app.tsx`, optionally `demo-catalogue.ts`
- [ ] **5. E2E + walkthrough + archive**
  - Files: `tests/e2e/*`, PR artifacts, `docs/archive/`

### Test strategy

| Layer | What |
| --- | --- |
| Unit | Predicate matrix for show/hide |
| Component | CTA/hint renders; click calls `onOpenDefenses` |
| E2E | Offense-only → open Defenses → apply → guidance cleared |
| Manual | Visual density; inspector collapsed; overlay open; Present/Demo hidden |
| Parity | Confirm no unintended Demo/golden drift; exception documented |

### Acceptance criteria mapping

| Criterion | Milestone | Verified by |
| --- | --- | --- |
| Empty defense remains valid; no auto-apply | 1, 3 | Code review + e2e |
| Obvious path to Defenses browser | 3 | Component + e2e + manual |
| Call-book before freehand in messaging | 3, 4 | Copy review + tests |
| Existing apply/shortcut behavior unchanged | 3, 5 | Parity/e2e |
| PO-approved parity exception recorded | 1, 5 | ADR + PR |

### Risks & notes

- **Parity tax:** Any canvas chrome is user-facing divergence — keep minimal and approved.
- **Collapsed inspector:** Option B alone fails if the Coach works field-first with inspector closed; prefer A or A+B.
- **Pointer conflicts:** CTA must not capture grass drags outside its hit target.
- **Intentional no-defense installs:** Offense-only play cards are legitimate; CTA must feel optional, not blocking.
