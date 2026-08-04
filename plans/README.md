# Chalk — build plan

Six phases, ordered by value. Each file is a self-contained prompt: hand one to a fresh
session and it has everything needed to do that phase without re-reading the review.

| Phase | File | What it lands |
|---|---|---|
| 1 ✅ | `phase-1-formation-intelligence.md` | Formations as structured football objects; non-destructive apply incl. "Realign — keep assignments" |
| 2 ✅ | `phase-2-concept-families.md` | Library as concept → variation tree; edit scope; propagation; detach |
| 3 ✅ | `phase-3-workspace.md` | Full-window canvas, collapsible panels, minimap, presentation/print modes, label collision, type presets |
| 4 | `phase-4-coaching-outputs.md` | Install page, position view, wristband, scout card, quiz, slide, playbook PDF |
| 5 | `phase-5-animation.md` | Route timing, play/scrub, animated export |
| 6 | `phase-6-durability-and-naming.md` | Version history & recovery, touch/stylus, product rename |

## Shared context — true for every phase

**The file.** Everything lives in `Chalk Play Editor.dc.html` — a single Design Component.
Template between `<x-dc>`, logic in `class Component extends DCLogic`, edited with
`dc_html_str_replace` / `dc_js_str_replace`. ~3,300 lines. Do not split it into child DCs.
Do not rewrite it wholesale; make targeted edits.

**Styling.** Inline styles only. No CSS classes, no stylesheets. `<helmet>` holds only the
Geist font links and body resets. Existing palette, reuse it exactly:

```
ink      #171717      text, offense marks
mid      #4D4D4D      secondary text
grey     #8F8F8F      labels, captions, status bar
line     rgba(0,0,0,0.08)   all hairlines, as box-shadow not border
hover    #F2F2F2 / #EBEBEB
surface  #FFFFFF      panels, inputs
canvas   #FAFAFA      app background
blue     #0072F5      selection, active, links   (#005FCC hover)
red      #E5484D      destructive, blitz
green    #398E4A      saved confirmation
orange   #C2540A      stunt
yellow   #F5D90A      notes
```

Type: Geist 11–14px in chrome; Geist Mono 11px for numbers, keys, status. Panel section
headings are 11px/500/0.8px tracking/uppercase/#8F8F8F. Controls are 26–34px tall,
6px radius. Hints under a control group are 11px #8F8F8F, 15px line-height.

**Field coordinate space.** The doc is drawn in a 1000×620 SVG. `this.yToPx(yards)` and the
inverse convert depth to pixels; the line of scrimmage and hash x-positions (401, 599,
`F.midX`) are already defined in the snapping code. Never introduce a second coordinate
system.

**Document shape.** `state.doc = { players: [], routes: [], labels: [] }`.
Player: `{id, x, y, symbol, label, sub, fill, color, side?, group?}`.
Route: `{id, playerId, kind, points:[{x,y,curve?}], lineStyle, end, color, prog, assign,
conv, note, branches?, segStyles?}`. Labels carry `{id, text, x, y, side, leader}`.

**Mutation discipline.** Every document change goes through `this.commit(doc, extra)` — it
pushes undo, clears redo, autosaves. Live text fields use `beginEdit()` / `endEditNow()` so
a whole typing burst is one undo step. Never `setState({doc})` directly.

**Persistence keys.** `fpd.current.v1` (working doc), `fpd.plays.v1` (library),
`fpd.formations.v1` (custom formations), `fpd.examples.v8` (seed guard). Any new key
follows `fpd.<thing>.v1` and is read inside try/catch with a safe fallback. Never clear a
key you did not write.

**Voice.** Panel copy talks like a coach, not a CAD manual: "Replaces the offense — the
defense and your notes stay put." Lowercase shortcut hints in the status bar. No emoji.
No exclamation marks. Never label a button with a noun the user has to decode.

**Bar for done.** Nothing ships that only looks right in a screenshot. Each phase's prompt
ends with a checklist of interactions that must actually work; run them.

**Do not.**
- Do not restyle or re-layout anything the phase does not name.
- Do not add tweaks/props for things in-place editing already covers (copy, single colors).
- Do not draw illustrative SVG artwork by hand. Field lines and player symbols only.
- Do not introduce a build step, npm import, or `.jsx` file.
