# Prompt for Claude Code

Paste this into Claude Code at the root of `andysolomon/arc-chalk`, with this folder copied into the repo (e.g. `docs/design/inspector-assignments/`).

---

Implement the inspector / sidebar / settings redesign described in `docs/design/inspector-assignments/README.md`. See `screenshots/01–08` for the target states, and open `Inspector Redesign.dc.html` in a browser for the full reference: frames **1a** (desktop, settings) and **2a** (mobile web). Ignore **1b**.

**Goal:** the right inspector becomes assignments only. Everything not about what a player is asked to do moves to a left sidebar (per-play admin + navigation) or to Settings.

**Do NOT change the field canvas:** no edits to `field-diagram.tsx`, rendering, pointer/gesture handling, the tool rail, the status bar/timeline, or the quick tray. Only panels, sidebar, settings, and the phone sheet/drawer shell.

Steps:
1. Read `apps/web/src/components/chalk-app.tsx` (`Inspector`, `PlayerInspector`, `RouteInspector`, `LabelInspector`, `ResetRow`, the left rail / `railOpen`), `inspector-sections.tsx`, `settings-overlay.tsx`, `rail-icons.tsx`, and the `.inspector*`, `.phone-workspace`, `.settings-*` rules in `styles/app.css`. Summarize the current structure before editing.
2. Extract a new `PlaySidebar` component (new file `components/play-sidebar.tsx`). Move into it: formation / defensive-call picker, "+ save formation", Ball on, ResetRow, Shadow show/hide + its picker, play type, layers (`LayerToggles`), Help (Commands, Shortcuts), and footer links to Print & export and Settings. Merge it with the existing left Playbook rail rather than adding another column; keep its collapse state in `ChromeState`.
3. Rewrite idle `Inspector` to: bar ("Assignments", "N of M", collapse) → Play call (Concept, Line call via `PresetPicker`; line call offense only) → grouped roster of the play's own unit (skill/backs/line or front/LB/secondary). Row click selects the player. Keep `aria-label="Play inspector"`.
4. `PlayerInspector`: show only the assignment kind that pertains to him (routes for skill/backs, blocks for linemen, calls for defenders — existing `isLineman` / unit logic). Fold "Quick blocks" for skill players. Keep all existing actions. `RouteInspector` and `LabelInspector`: restyle only.
5. `SettingsOverlay`: convert to a tabbed modal (Field · Playbook · History · Print & export · Account · About). Move Account from the More menu into a tab (leave a More-menu shortcut to open it).
6. Phone (`.phone-workspace`, mobile web in Safari/Chrome): replace the Inspector stub + sheet with a two-snap Assignments sheet (peek: header + man-chip strip + tools; full: roster or selected man with a prev/next pager). Add ≡ in the header to open the sidebar as a left drawer with 44px rows. Settings becomes a full-screen page with pill tabs. All targets ≥44px; keep header ≤104px portrait.
7. Update tests: `tests/e2e/inspector-layout.spec.ts`, `tests/e2e/phone-editor.spec.ts`, `tablet-layout.spec.ts`, and `chalk-app.test.tsx` for the new locations (formation now reached from the sidebar/drawer). Add a spec asserting the inspector contains no formation, shadow, library, layers, print or field controls at 1363×936, 1194×834 and 390×844.
8. Add an ADR "Assignments-only inspector with play sidebar" recording this as a parity exception (ADR 0039).
9. Run `bun run check`, `bun run test`, and the phone Playwright projects. Commit as `feat(editor): assignments-only inspector, play sidebar and tabbed settings`.

Use existing tokens and classes from `app.css`; no new colors. Match spacing, sizes and copy from the README.
