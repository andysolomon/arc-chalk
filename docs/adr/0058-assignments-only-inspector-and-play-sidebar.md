---
status: accepted
---

# Assignments-only inspector with a play sidebar and tabbed Settings (parity exception to ADR 0039)

ADR 0043 folded the original's one long right-hand panel into disclosures, and ADR
0045, 0052 and 0053 moved more into it: the shadow's picker, the Draw row, the reset
rows, the layers. By September 2026 the inspector still mixed what a man is asked to
do with how the play is set up — Formation, Ball on, the Shadow, the Library with its
variations and scopes, Show on the field, Help — and a phone reached all of it through
one floating _Inspector_ stub and a sheet that went away on every pick.

Product decision (design handoff `docs/design/inspector-assignments`, 2026-09-25):
the right inspector is **assignments only**. Everything that is not about what a
player does moves to a **left sidebar** (per-play admin and navigation) or to
**Settings** (playbook- and device-level). Direction _1a_ for desktop and iPad,
_2a_ for the mobile web layout; _1b_ in the design file is rejected. Recorded here
as a standing parity exception under ADR 0039: controls, their words and their
behaviour are unchanged; where they stand is not.

## Decision

**The sidebar** (`PlaySidebar`, `nav aria-label="Sidebar"`, 236 px, docked left of the
tool rail). _Playbook_: Plays (count), Game plans (count), Game Day — the header's
three destinations again, where a reader expects them. _This play_: **Formation**
(or **Defensive call** on a defensive play) opens the Formations or Defenses browser
directly, with the **Reset to** row under it once a set is chosen; **Ball on**,
**Shadow defense** / **Shadow offense** (Shown / Hidden, the other unit's picker and
its reset), **Play type**, **Show on field** (the layer switches) and **Library** (the
panel of ADR 0043, unchanged inside) each open in a popover anchored to the row.
Footer: **Print & export**, **Settings**, **Help** (Commands ⌘K, Shortcuts ?). The
sidebar folds on `⌥3` and from its own control, comes back from a stub, and its state
is remembered per device in `ChromeState.sidebarOpen`; Focus mode hides it with the
other two panels.

The handoff asked for the sidebar to be folded into "the existing left Playbook rail".
That rail is the drawing-tool rail, which the same brief puts out of scope, and the
chosen frames draw both columns; the sidebar is its own column and the tool rail is
untouched.

**The inspector** (`aside aria-label="Play inspector"`, 300 px). Idle: a bar that says
_Assignments_ and _N of M_ (men of the play's own unit with at least one line or
assignment); _Play call_ — Concept and Line call, each opening the catalogue of ADR
0043, on an offensive play; then the **roster**, grouped Skill / Backs / Line on
offense and Front / Linebackers / Secondary on defense (ADR 0010's position groups,
read from each man's role and where he stands), each row his letter, one line saying
what he does — the Coach's Assignment words, else the call his line was drawn as, else
the kind of line — and what he plays. A row picks him exactly as a tap on the field
does. Shadow men never appear. A picked **man** keeps his panel and gets only the kind
of assignment that pertains to him: routes and alternates with **Quick routes** and
**Quick blocks folded** for a receiver or back; blocking alone for a lineman;
assignments alone for a defender; Appearance folded under all three. The **Route**
and **Text** panels are restyled and otherwise as ADR 0043 left them.

**Settings** (`SettingsOverlay`) is a 720 × 440 modal with tabs down its left —
Field, Playbook, History, Print & export, **Account**, About — each holding the section
that used to stack. Account moves here from the More menu, which keeps an **Account…**
shortcut to the tab. About names the build (`CHALK_VERSION` at build time).

**The phone.** The header's left carries `≡`, which opens the sidebar as a 304 px
drawer over a scrim; _This play_ rows push a page inside it, and Formation opens the
browser and closes the drawer on a pick. The inspector is an **Assignments sheet** with
two heights over the field, above the tools: _peek_ — one bar, _Assignments · N of
M · the concept · the line call_ — and _full_ — the roster, or the picked man with
_‹ All 11_, _Field ⌄_ and a pager through the unit in roster order. Tapping the bar opens it full, on
the picked man if there is one; Field, a tap past it, or starting a line by hand
drops it to its peek; a quick call chosen in the sheet or the tray keeps the sheet
where it is. The floating _Inspector_ stub is gone. Settings on a phone is a
full-screen page with pill tabs. Every target is 44 px, and the header stands above
the sheet and both drawers, so its menus open over them. A man with no letter is
marked by the spot he plays (LT, C) wherever the roster draws him.

The handoff's peek also drew a strip of chips, one per man with the word he runs.
The product owner dropped it on 2026-09-25 after trying it on a phone: the bar
alone keeps more of the field in view, and the roster is one tap away.

## Preserved

Every control keeps its words, its title and its command: the browsers and their
shortcuts (`⇧⌘F`, `⇧⌘D`), the Reset rows, the shadow switch and the rail's H, the
layers and their exports, the library's variations, scopes and pushes, the concept
and line-call catalogue, the Draw row and Free draw, quick calls, alternates,
appearance, coaching, timing, the page kinds and type presets, History, the tablet's
inspector drawer and its stub, the quick tray, and `⌥1` / `⌥2`. The Route, Text and
Player panels answer to the same names in tests.

## Parity evidence

Measured against the original's goldens at 1440 × 960 in
`tests/parity/production-shell.spec.ts`, on one Linux machine, this branch against
main (pixels differing out of 1,382,400): Editor 18,105 → 31,601; More menu 20,265 →
32,954; Export menu 19,507 → 32,926; Save menu 18,334 → 31,752; command palette
19,381 → 32,875; shortcut reference 40,564 → 53,575; Formations 27,738 → 31,592;
Defenses 22,221 → 25,856. Present, Print and Demo did not move. Giving each roster row the man's own word added about 250 px to each of those states the same day (Editor 31,825). The difference in each
is the 236 px sidebar column the original does not draw; the ratchets are raised to
the branch measurements and the numbers are recorded in
`docs/original-prototype-parity-matrix.md`.
