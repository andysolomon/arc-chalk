---
status: accepted
---

# Contextual inspector with progressive disclosure (parity exception to ADR 0039)

ADR 0039 requires the production app to match the original prototype's Coach-facing
workflow. The original's idle inspector shows everything at once: Formation and Ball on,
six line calls, ten concepts, Defense, the whole Library tree with its edit scopes and
delete controls, Field profile creation, History, five page layouts, three type presets,
four layer toggles, and Help — each with a paragraph of explanation. At the reviewed
1363×936 desktop viewport the Library begins near the bottom and the rest needs
substantial scrolling; on a defensive play the panel still offers offensive concepts and
"Applies to all 0 linemen". The selected-player and selected-route panels put symbol,
fill and colour before the assignment.

Product decision (GitHub #64, 2026-09-13): simplify authoring. The inspector leads with
the coach's immediate task and folds the rest away. Recorded here as a standing parity
exception; the controls themselves, their words and their behaviour are unchanged.

## Decision

**Idle panel, in order.** _Play setup_ (on an offensive play: Formation, Ball on, and
two summary rows — the concept on the field and the line call on the field — each
opening the catalogue below; on a defensive play: _Defensive call_ leads instead). Then
folded sections whose heading and a one-line summary stay in view: _Opponent look_
(the other unit's picker; the field's **Add a defense** control remains), _Library_
(the original panel, unchanged inside), _Field_ (current profile and reapply offers),
_Playbook settings_ (new Field Profile form; Play Types are managed from the header
pill), _History_, _Print & export_ (page layouts and type presets), and _Help_.

**Catalogue.** The six line calls and ten concepts become one searchable picker with
Favorites and Recent at the top, reached from the summary rows: two intentional
actions to any preset. Picking a concept or call that is already on the field takes it
off, as the original's buttons did. Stars and recent picks are device-local chrome.

**Layers.** _Show on the field_ moves into a Layers popover in the inspector's own
thin bar, which also carries the inspector's collapse control. `⌥1` and `⌥2` — already
listed in the shortcut reference — now fold the inspector and the tools. Whether each
panel and each folded section stands open is remembered per device.

**Selected objects.** A player's letter, tag, lines, quick calls and alternate come
first; symbol, fill and colour fold under _Appearance_. A route's kind and coaching —
read, assignment, conversion, note — come first, with choice/flip/straighten beside
them; line, ending and colour fold under _Appearance_; timing and delete under
_Advanced_.

**Help.** Each panel's paragraph becomes a `?` control that opens the same sentence
by tap or click, with the sentence also on hover.

**Removed.** The sidebar _Save_ (the play saves continuously; the header's Save menu
names versions). The library rows' delete `×` shows on hover or focus rather than
always; on a coarse pointer it stays visible.

## Preserved

Option routes, alternates, blocking, motion, coverage, animation timing, and
variation propagation are untouched: the same commands run from the same controls.
Formation search, favourites and `⇧⌘F` / `⇧⌘D` remain. The command palette still
runs every action.

## Parity evidence

Measured on the same Linux machine before and after (pixels differing from the
original's goldens, 1,382,400 px frames): Editor 17,722 → 16,097; More menu
18,721 → 17,169; Export menu 17,833 → 16,623; Save menu 17,951 → 16,319; command
palette 17,866 → 16,496; Formations 26,597 → 25,324; Defenses 20,866 → 19,574;
shortcuts 38,313 → 33,818; Present, Print and Demo unchanged. The folded panel is
closer to the original's golden than the unfolded one was, because less of the panel
is chrome the original draws differently. Thresholds in
`tests/parity/production-shell.spec.ts` were not raised. Recorded in
`docs/original-prototype-parity-matrix.md` and `docs/parity/README.md`.
