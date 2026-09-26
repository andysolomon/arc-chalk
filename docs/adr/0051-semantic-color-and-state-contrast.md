---
status: accepted
---

# Restrained semantic colour and clearer state contrast (parity exception to ADR 0039)

The original's shell is monochrome on purpose: neutral field, Geist, hairlines, one
selection blue, and the route and coverage colours kept for the diagram. That suits the
product, but much of the chrome around the field uses the same grays for different
things — a category, the current call, an inactive tab, a control that cannot be
pressed — so a Coach scanning a library, a game plan or the Game Day reader has to read
every word to tell them apart. The header pill's dot was blue whatever the Play was.
Routine install and offline-ready notices sat as two broad bands over the field until
dismissed, and came back on the next start. GitHub #73 asked for a small semantic
palette, applied to chips and indicators rather than surfaces, with contrast, colour-vision
and grayscale checks, and for routine status to condense once read while real failures
stay conspicuous.

## Decision

**A three-colour Unit palette, and status colours reserved for status.** `unitPalette`
in `@chalk/render` names one accent and one tint per Unit — Offense azure
`#2e6bb0` / `#e6eff9`, Defense wine `#7a2e5a` / `#f6e6ef`, Special teams ochre
`#8a6a12` / `#f7f0dc` — and `apps/web/src/styles/app.css` mirrors the values as tokens
beside `--selected`, `--focus`, `--disabled`, `--ready`, `--warn` and `--error`. The
accent paints a dot or a hairline, the tint a chip's ground, and ink stays the text, so
every badge reads by its word first. `packages/render/src/unit-palette.test.ts` holds the
choice to its checks: each accent at least 3:1 on its tint and 4.5:1 on paper, ink at
least 12:1 on every tint; the three accents at least ΔE 20 apart under protan, deutan
and tritan simulation (Machado 2009) as well as typical vision; and each accent at least
ΔE 30 from the field's route strokes (blue, red, green, orange, yellow) and ΔE 15 from
its coverage fills. Saved route colours and the display presets are untouched. The
status colours (`--ready`, `--warn`, `--error`) carry the same values the save chip and
the Game Day readiness chip already used, now by token, and nothing else uses them.

**One labeled badge for the Unit, everywhere it is named.** `UnitBadge`
(`apps/web/src/components/unit-badge.tsx`) is a tinted chip with an accent dot and the
Unit's word: on Playbook browser cards, on every game plan row and the open plan's
header, on the Game Day plan list and the reader's title. Unit filter chips and the Unit
segments in the header pill and the new-plan form carry the dot beside their word, and
the header pill's own dot takes the open Play's Unit — its geometry, hairline, type and
position do not move. On paper, `unitBadgeHtml` and `classificationHtml`
(`packages/exports/src/unit-badge.ts`) print the same word as a small bordered badge in
the Unit's accent on its tint — in call sheets, game-plan sheets, teaching pages and the
binder cover — with `print-color-adjust: exact` so a colour printer keeps it and the
existing monochrome option desaturates it to a bordered label. The printed field sheet's
corner caption stays text, as the original printed it; the on-screen facsimile now names
Special teams correctly instead of calling it Offense.

**Four states that look like four things.** The keyboard focus ring is one rule with one
token and reaches every element the keyboard can land on (buttons, inputs, selects,
textareas, summaries, links, anything with a tabindex), not only three of them; the
scrubber's own blue joins it. The current call in the reader and the active format in
Print & export carry a 3 px selection rule on their left edge over the tint, so the row
the Coach is on survives grayscale, and a Playbook card that is current (tint and 1 px
ring) is no longer drawn the same as one that merely holds keyboard focus (focus ring).
The active tool keeps its ink fill. Every disabled control shares `--disabled` and a
not-allowed cursor, so a control that cannot be pressed is not mistaken for an
unselected segment or an inactive tab, which stay muted.

**Routine status condenses once read; failures never do.** The lifecycle store keeps a
per-device set of acknowledgements (`chalk.shell.acknowledged`). The offline-ready note
and the install offer each show once as a band; **Dismiss** or **Not now** records the
acknowledgement, and from then on `LifecycleIndicator` renders a quiet "offline ready"
word with a green dot, and a quiet "install" control, in the status bar — neither a live
region. Offline-readiness is a fact rather than a one-time event: a page a service
worker already controls is offline-ready on later starts too. The wording says what it
means — Chalk itself opens without a connection; whether a plan's plays and images are
on the device is what Game Day checks — so the shell never claims a game plan is
cached. A shell that could not be prepared for offline is an alert, not a status, and
stays a band however much was acknowledged; a failed save keeps its red chip.

## Preserved

Geist, the neutral canvas, hairlines, control radii, the compact density, the icon
family, the seven tools and the blue selection on the field; the pill's geometry and
words; the route and coverage colours and the Coach's saved route colours; every
command, label and shortcut; the printed field sheet; the `.lifecycle-notices
.notice.offline` band the e2e and PWA tests read.

## Parity evidence

At the parity viewport (1440 × 960, fine pointer, seeded Play) the only pixels that
change are the header pill's 8 px dot (route blue to Offense azure) and, in the Print
state, the 3 px selection rule on the active format. The badges live in Playbooks, Game
plans, Game Day and the printed HTML, none of which the goldens capture, and the quiet
indicator renders only when a worker controls the page, which the dev server the parity
run uses never does. Measured gaps are recorded in `docs/parity/README.md`; no ratchet
was raised.

Before/after captures at identical viewport sizes: `docs/reviews/screenshots/73-*.png`.

## Not decided here

A dark theme (since decided in ADR 0061); colour for Types within a Unit (the Unit alone is coloured, as the issue
asked); any change to the field's route presets; physical iPad/Safari checks of the
printed badges.
