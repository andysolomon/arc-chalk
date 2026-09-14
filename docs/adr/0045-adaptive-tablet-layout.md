---
status: accepted
---

# Adaptive tablet layout and real touch targets (additive extension under ADR 0039)

The production shell carried `min-width: 1024px`, so an iPad held upright (834 CSS px)
or beside another app in Split View clipped the editor rather than fitting it. Below
1180 px the inspector only narrowed. On a coarse pointer every button and select grew a
centred 44 × 44 pseudo-element, so neighbours 24 px tall overlapped each other's hit
regions and a tap between two controls was a coin toss. The Playbook browser laid its
cards in a fixed four-column grid and raised the keyboard by focusing search on entry.
GitHub #68 asked for layouts chosen by the width that is there, real touch boxes, a
grid that reflows, and search the Coach asks for.

## Decision

**Three layouts by width, one shell.** At 1180 px and above the inspector docks at
292 px; from 1024 px it docks at 278 px, as before. Below 1024 px the inspector becomes
a drawer over the right edge of the field, opened and closed from the same stub, `⌥1`
and Layers controls, so the field keeps the width and the rail stays put. The header
drops its brand text, shortens the play name and Undo/Redo, and hides _New play_ and
_Help_ behind the More menu and a `?` control, so every destination and menu stays on
one row down to 668 px. Below the editor's own floor (`EDITOR_MIN_SCREEN`, 668 × 440)
the reading shell shows the Play — and now also carries the three destinations and an
explicit **Edit on this screen** control, so a narrow Split View can still reach
Playbooks and Game Day and a Coach who means to draw on it can. The choice is his for
the session; nothing is inferred from the screen being small.

**Touch boxes are real boxes.** The pseudo-element expansion is gone. Under
`(pointer: coarse)` primary actions — the tool rail, header buttons and tabs, menu
items, Present's controls, the inspector stub — are at least 44 × 44 CSS px in their
own layout, with the spacing that implies. Compact secondary controls — segmented
buttons, the inspector bar, disclosure toggles, the scope bar, the timeline — stand
32 px tall with 6–8 px between them, deliberately, rather than pretending to be 44.
The field's own handles were already right (ADR 0016) and are unchanged.

**The grid reflows with the room it has.** The Playbook browser measures its scroller
and lays out one to six columns of at least 200 px; the virtual rows are grouped from
the same number, so the row math and the CSS agree by construction, and a change of
column count keeps the card the Coach was on in view. Search focuses when tapped, not
when the browser opens, on a coarse pointer; the Defenses browser does the same.

## Parity

Additive. At the parity viewport (1440 × 960, fine pointer) nothing here applies:
no rule below 1024 px, no coarse-pointer rule, and the four-column grid is what the
measurement produces at the browser's width. The desktop goldens and ratchets are
unchanged. Recorded in `docs/original-prototype-parity-matrix.md`.

## Evidence

`tests/e2e/tablet-layout.spec.ts` walks 1366 × 1024, 1180 × 820, 1024 × 768,
834 × 1194, 694 × 768 and 507 × 768 on Chromium with touch emulated, and checks that
the destinations, the play, and the selected call stay reachable without horizontal
overflow, that primary targets measure at least 44 px with no two boxes overlapping,
and that search is not focused on entry. WebKit and physical iPad Safari checks are
recorded on the pull request as run or not run; this machine cannot launch WebKit.

The `webkit-ipad` Playwright project — the editor's tablet gate — now names the iPad Pro
11 in landscape (1194 × 834), where the inspector docks and the drawing suite reads it
as it always did. It had run in portrait only because that is the device descriptor's
default, on a page that overflowed its 1024 px floor. Portrait and Split View, where the
inspector is a drawer or the reading shell stands in, are the tablet spec's business.
