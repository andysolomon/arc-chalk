# Handoff: Assignments-only Inspector, Left Sidebar, Settings

## Overview
Chalk's right-hand inspector currently mixes player assignments with play setup, shadow defense, library, layers and help. This redesign makes the inspector **assignments only** and moves everything else into a **left sidebar** (per-play admin + navigation) and the existing **Settings** overlay (playbook/device-level). It also defines the **mobile web** layout (phone browser, not a native app).

The chosen direction is **1a (Roster drill-in)** for desktop/iPad and **2a** for mobile web. 1b in the design file is a rejected alternative — ignore it.

**Out of scope:** the field canvas (`field-diagram.tsx`, rendering, gestures, tool rail, status bar/timeline, quick tray behavior). Do not change how the field draws or how players/routes are manipulated.

## About the Design Files
The files in this bundle are **design references created in HTML** — they show intended look and behavior, not production code. Recreate them in the existing app (`apps/web`, React + Tailwind/shadcn Base UI per ADR 0029) using its established components, class names and tokens in `apps/web/src/styles/app.css`. The field inside each frame is a stand-in drawing; the real canvas stays as is.

## Fidelity
**High-fidelity for structure, content placement and hierarchy.** Colors, type sizes and radii are taken from `app.css` tokens and should match. Glyph icons (≡ ⊞ △ ⎙ ⚙ etc.) are placeholders — use Lucide / `rail-icons.tsx`.

## Where things move

| Today (in Inspector) | Goes to |
| --- | --- |
| Formation picker + "+ save formation" | Sidebar → This play → **Formation** |
| Ball on (L hash / Middle / R hash) | Sidebar → This play → **Ball on** |
| Reset to chosen / base (ResetRow) | Sidebar → Formation row's detail (and Shadow's for defense) |
| Shadow defense / offense disclosure (show/hide + its picker) | Sidebar → This play → **Shadow defense** |
| Library disclosure / play type | Sidebar → This play → **Play type**; library list → sidebar **Playbook → Plays** |
| Show on the field (layers) | Sidebar → This play → **Show on field** (desktop keeps the Layers popover too) |
| Help (Commands ⌘K, Shortcuts ?) | Sidebar footer → **Help** |
| Field profile, Playbook settings, History, Print & export | **Settings** (already there — keep) + add **Account** tab |
| Concept, Line call | **Stay in Inspector** (they are group assignments) |
| Player panel (routes/blocks/calls, quick calls, draw, alternates, letter/tag, Appearance fold) | **Stay in Inspector** |
| Route panel (kind, coaching, choice/flip/straighten, Appearance, Advanced) | **Stay in Inspector** |
| Text label panel | **Stays in Inspector** (unchanged) |

## Screens

### 1. Desktop — nothing selected (frame "1a Desktop — nothing selected", 1180×720)
Layout, left→right: **Sidebar 236px** · existing tool rail 40px · field (flex 1) · **Inspector 300px**. Top bar and status bar unchanged.

**Sidebar** (`nav aria-label="Sidebar"`, 236px, bg #fff, right hairline `box-shadow:1px 0 rgba(0,0,0,.06)`, padding 8px 10px 10px, column)
- Group heading: 10.5px/600, letter-spacing .08em, uppercase, color `--muted` #8f8f8f, padding 12px 8px 4px.
- Row: height 32px, padding 0 8px, radius 6px, gap 8px; icon 16px muted; label flex 1 (13px ink); value right, 12px muted, ellipsis, max-width 88px. Active row bg #f2f2f2. Hover bg #f5f5f5.
- Groups:
  - **Playbook**: Plays (count) · Game plans (count) · Game Day. These route to the same destinations as the top bar's view tabs.
  - **This play**: Formation (current name, e.g. "Gun Doubles Rt") · Ball on ("Middle") · Shadow defense (call name, or "hidden") · Play type · Show on field ("4 of 5").
  - Spacer, then footer rows: Print & export · Settings · Help (⌘K hint right).
- Each "This play" row opens its control in a popover anchored to the row (desktop) — reuse the existing Formations/Defenses browser dialogs, the ball-spot segments, the ResetRow, the shadow Shown/Hidden segments and `LayerToggles`.
- For a **defensive** play, "Formation" becomes "Defensive call" and "Shadow defense" becomes "Shadow offense" (mirror existing `Inspector` logic).
- The sidebar collapses (existing `railOpen` / ⌥ shortcut pattern). **Check how the existing left Playbook rail (`railOpen`, `rail-icons.tsx`) works and fold this sidebar into it rather than adding a third column.**

**Inspector — idle** (`aside aria-label="Play inspector"` — keep this name for tests)
- Bar 38px: "Assignments" 600 + count "9 of 11" muted 12px (men with at least one line or assignment / total men of the play's unit) + collapse ›.
- **Play call** section (padding 14px 16px 0): heading style as above; two `.wide-picker` rows 36px, radius 8px, 1px rgba(0,0,0,.1): "Stick | Concept ›", "Slide left | Line call ›" (empty: "No concept yet", "No line call yet"). Open the existing `PresetPicker`. Line call only shows on offense.
- **Roster**, grouped: offense → Skill (X H Y Z), Backs (Q F), Line (LT LG C RG RT); defense → Front, Linebackers, Secondary (use position-group metadata, ADR 0010).
  - Row 36px, padding 0 8px, radius 6px, gap 10px: symbol 22px circle (1.4px ink border, 11px/700 letter) · assignment summary flex 1 (ink; empty = "No route yet" / "No block yet" / "No assignment yet" in #c9c9c9) · role 11.5px muted · chevron #c9c9c9. Hover #f5f5f5.
  - Click row = select that player (same as clicking him on the field) → Player panel.
  - Only the **play's own unit** is listed. Shadow players never appear here.

### 2. Desktop — player selected ("1a Desktop — player selected (Y)")
Keep `PlayerInspector`; restyle and reorder:
- Bar: ← back · player symbol 22px filled `--blue` with white letter · role name 600 · unit tag right (Offense #2e6bb0 / Defense #7a2e5a, 11px/600).
- Letter (56px wide) + Tag under (flex) inputs on one row, 32px, radius 7px.
- Section by kind, **only the kind that pertains to him**:
  - Skill/back: "Routes & alternates" list → Draw row (Route R · Block B · Motion M, Free draw switch) → **Quick routes** grid (3 cols, 29px buttons, active = ink bg) → **Quick blocks folded** (disclosure with summary) → "+ Alternate route — new stem from stance" (dashed) → Appearance fold.
  - Lineman: "Blocking" → Draw → Quick blocks grid → Appearance. No routes.
  - Defender: "Assignments" → Draw → Quick assignments grid → Appearance. No routes, no blocks.
- Line rows: 36px, radius 7px; selected line uses `--selected-tint` #eef4ff + inset `--selected-line` #c7dcff; quick-call select, Edit, ×.
- No formation, field, library or print controls anywhere in this panel.

### 3. Desktop — route selected ("1a Desktop — route selected")
Keep `RouteInspector` content, same order:
- Bar: ← · "Route" · "Y · Base stem" muted · "2 breaks" blue tag.
- Kind segments (Route / Block / Motion — from `kinds` prop).
- Coaching (with Hint): Read + Assignment row, Conversion, Coaching note (keep 90-char limit etc. — `ROUTE_COACHING_LIMITS`).
- + Choice at … · Flip · Straighten.
- Appearance fold, Advanced fold (timing + delete). Unchanged behavior.

### 4. Settings (desktop, "1a Settings panel")
Convert `SettingsOverlay` from a stacked list into a **720×440 modal with left tabs**:
- Left 200px (bg #fafafa, hairline): title "Settings" 15px/600; tabs 32px radius 6px, active bg #fff 600, value right muted 11.5px: **Field** (profile name) · **Playbook** (types · labels) · **History** (count) · **Print & export** (page · type) · **Account** (sync status — move the More-menu Account entry here, keep More → Account as a shortcut) · About (version).
- Right: header 48px (title + summary + Close); body padding 18px 22px, label column 110px muted 12px + control.
- Contents per tab = the existing sections of `settings-overlay.tsx` (fieldProfile node, playbookSettings node, history list, page kinds + type presets), unchanged in behavior.
- Opened from sidebar footer → Settings, and still from More menu.

### 5. Mobile web — nothing selected ("2a Mobile web — nothing selected", 390×844 in Safari)
This is the existing `.phone-workspace` shell. Changes:
- Header row 1: ≡ (opens sidebar drawer, 40×40) · view tabs Editor/Playbooks/Game Day · ··· More. Row 2: play name + unit line ("Offense · Gun Doubles Rt", 11.5px/600 unit color) · Undo · Redo · Save (40px). Keep header ≤104px (phone spec).
- Field unchanged.
- **Assignments sheet, peeked** (bottom, radius 16 16 0 0, grab handle 36×4): header 40px "Assignments · 9 of 11 · Stick · Slide left ⌃"; a horizontal, scrollbar-less strip of **man chips** 52×56 (letter 14px/700 + assignment word 8.5px/600 in unit blue, or "—" #c9c9c9). Tap chip = select that man and expand sheet to full height. Tap header / drag handle up = full-height roster list (same rows as desktop, 44px tall).
- Tool rail row stays at the bottom of the sheet (44px targets) with zoom.
- Remove the old "Inspector" floating stub; the sheet replaces it.

### 6. Mobile web — man selected ("2a Mobile web — Y selected, sheet full-height")
- Sheet at full height under the header (field hidden behind it). Header 48px: "‹ All 11" (back to roster) · symbol + role centered · "Field ⌄" (collapse sheet to peek).
- Body = Player panel content at touch size: inputs 44px radius 10px; line row 48px; quick routes 3-col grid of 44px buttons; draw buttons 44px; alternate dashed 44px; Quick blocks and Appearance folded (44px rows).
- Footer pager 60px: "‹ H Flat" · "8 of 11" · "Slant Z ›" — steps through the unit in roster order.
- Picking a quick route keeps the sheet open (it updates the chip + field behind). Tapping Draw collapses the sheet to peek so the field is drawable; Done returns (keep the current phone behavior of the sheet getting out of the way on draw).

### 7. Mobile web — sidebar drawer ("2a Mobile web — sidebar drawer")
- Left drawer 304px, full height, over a scrim rgba(23,23,23,.35); close × top-right; same groups as desktop sidebar with 44px rows and › chevrons; footer Print & export · Settings · Help + "Saved on this device" (`--ready` #2b6a3a).
- "This play" rows push a sub-page inside the drawer (Formation opens the Formations browser full-screen).

### 8. Mobile web — Settings ("2a Mobile web — Settings")
- Full-screen page: "‹ Back · Settings" header; horizontal pill tabs (34px, active ink); content with 48px grouped rows, segmented controls 38px, switches 44×26.

## Interactions & Behavior
- Selecting on the field and selecting in the roster are the same state (`selection` in the editor store). Esc / ← returns to idle.
- Assignment summary text per row: the Coach's Assignment text if present, else the preset name the line was drawn as, else line kind; linemen show the block call.
- Roster count "N of M" = players of the play's unit with ≥1 line or assignment.
- Remember sidebar open/closed and fold states per device via the existing `ChromeState` persistence.
- Keyboard: keep all existing shortcuts (⇧⌘F formations, ⇧⌘D defenses, ⌘K, ?, ⌥1 inspector). Add ⌥2 (or the existing rail shortcut) for the sidebar.
- Mobile targets ≥44px. Sheet snap points: peek (header + chip strip + tools) and full.

## State
- `sidebarOpen` (reuse `railOpen` if the rail is merged), `sidebarPopover: "formation"|"ball"|"shadow"|"type"|"layers"|null`.
- `sheetSnap: "peek"|"full"` on phone (replaces `inspectorOpen` toggle there).
- `settingsTab: "field"|"playbook"|"history"|"print"|"account"|"about"`.

## Tests to update
- `tests/e2e/inspector-layout.spec.ts`: formation / Library are no longer in the inspector — assert them in the Sidebar instead; keep concept, line call, Assignment textbox, Advanced fold assertions.
- `tests/e2e/phone-editor.spec.ts`: the "Inspector" button + `getByTitle("Browse formations — ⇧⌘F")` flow moves to ≡ drawer → Formation; sheet assertions change to peek/full.
- `chalk-app.test.tsx` Play inspector queries.
- This is a Coach-facing change, so record it as a parity exception ADR (see ADR 0039 / CONTEXT.md).

## Design Tokens (from app.css)
--ink #171717 · --muted #8f8f8f · --line rgba(0,0,0,.08) · --paper #fff · --canvas #fafafa · --hover #ebebeb · segments bg #f2f2f2 · --blue/--selected #0072f5 · --selected-tint #eef4ff · --selected-line #c7dcff · --disabled #c9c9c9 · --unit-offense #2e6bb0 / tint #e6eff9 · --unit-defense #7a2e5a / tint #f6e6ef · --ready #2b6a3a · --red #c53b3f.
Type: system UI stack; body 13px (desktop) / 14px (phone); section headings 10.5–11px/600 uppercase .08em; titles 14–15px/600.
Radii: 6 (rows, buttons), 7–8 (inputs, pickers), 10 (phone controls), 12 (settings modal), 16 (sheet top).
Hairlines: `box-shadow: 0 0 0 1px` / `1px 0 rgba(0,0,0,.06)` as in app.css. Modal shadow 0 20px 60px rgba(0,0,0,.25).

## Files
- `Inspector Redesign.dc.html` — all frames. Turn 2 (**2a**) = mobile web; turn 1 **1a** = desktop + settings. (1b = rejected.)
- `Chalk Field.dc.html` — placeholder field used inside frames (not to be implemented).
- `support.js` — runtime needed to open the .dc.html files in a browser.
- `PROMPT.md` — the prompt to paste into Claude Code.
- `screenshots/` — 2× PNGs of the chosen frames:
  - `01-desktop-idle.png` — Desktop, nothing selected (sidebar + Assignments roster)
  - `02-desktop-player-selected.png` — Desktop, Y selected
  - `03-desktop-route-selected.png` — Desktop, Y's route selected
  - `04-desktop-settings.png` — Settings modal with tabs
  - `05-mobile-web-idle.png` — Mobile web, sheet peeked
  - `06-mobile-web-player-selected.png` — Mobile web, Y selected, sheet full
  - `07-mobile-web-sidebar-drawer.png` — Mobile web, sidebar drawer
  - `08-mobile-web-settings.png` — Mobile web, Settings page
