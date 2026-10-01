---
status: accepted
---

# One home for every control (amends ADR 0044 and ADR 0058)

ADR 0044 put the destinations in the header and kept New play, Present and
Game plans… in More as well. ADR 0058 then gave the editor a sidebar whose
Playbook group repeated the header's three tabs, whose foot repeated Print &
export and Help, and whose Play type row opened the header pill's panel. By
September 2026 a desktop editor showed Game plans in three places (the
Playbooks tab, the sidebar row, More → Game plans…), Help, Settings, Print &
export, New play, Present and the Play type in two each, and More had grown to
fourteen entries, two of them folded panels.

Product request (2026-09-30): stop duplicating Help, Playbooks and Settings;
re-examine More and the sidebar for what needs to be there, what can go, and
what can fold away; draw some of the words as icons, the way T3 Code's
sidebar draws its foot. The product owner chose each home below.

## Decision

**One home per control, per layout.** Where a phone's header sheds a control
(ADR 0057), the phone's home for it is the one place it appears there; a
desktop never shows it twice. The command palette still runs everything.

**Navigation is the header's.** Editor · Playbooks · Game Day are the only
destinations. The sidebar's Playbook group (Plays, Game plans, Game Day) and
More's _Game plans…_ are gone; Game plans is the Playbooks tab's _Game plans_
page, or ⌘K. The sidebar appears only in the editor, where the tabs are always
on screen, so its rows only ever repeated them.

**The sidebar is this play's.** _This play_ keeps Formation (or Defensive
call) with its Reset row, Ball on, and the Shadow. **Show on field** and the
**Library** fold under a **View & library** heading that opens and closes,
closed until the Coach opens it and remembered per device in
`ChromeState.open["sidebar:view-library"]`. The **Play type** row is gone: the
header's Unit pill opens the same panel and is its one home.

**The sidebar's foot is icons.** Settings (a gear) and Help (?) sit in a row
at the foot with the fold control at its end, named for a screen reader and
titled for a pointer. Help opens the whole Help menu that the header used to
carry — the guided tour, the five tutorials, Keyboard shortcuts and Command
palette — in a popover rising from the foot, or as a page in the phone's
drawer. The phone's drawer also carries **Print & export** first, since the
phone header has none; a desktop's is the header's.

**The header.** Help leaves the editor's header. **Undo**, **Redo**, **Reset
positions** and **Present** are icons: the phone's hook-back arrows (ADR 0057)
everywhere, a turn back round a dot for Reset positions, a presentation board
for Present. Each keeps its name and its title. New play, Print & export and
Save keep their words. The **Playbooks** and **Game Day** pages have no
sidebar, so the same Help and Settings icons stand at their header's end in
place of More, whose every action worked on a field those pages do not show.
On a phone those pages drop the ≡, which opened nothing there. Settings, the
shortcut reference and the Conflict Inbox now open over those pages; they
used to wait for the editor.

**More is the field's.** Focus mode, Hide zone areas, Mirror, Flip strength,
Clear… and Share & assets. On a phone it also carries New offensive play, New
defensive play and Present. _Settings…_ and _Account…_ are gone (the gear, and
its Account tab); **Backup** moves to **Settings → Account**, beside the rest
of this device's data, and is open there rather than folded.

## Preserved

Every command, its words, its shortcut and its palette entry; the Unit pill
and its panel; the Formation and Defense browsers and the Reset rows; the
shadow's picker and the rail's H; the layers; the Library panel; the Clear
page; Share & assets; the Account panel; Backup's passphrase, file and
messages; ⌥3 and the sidebar's stub; the phone header's rows (ADR 0057).

The sidebar's plan count (issue #167) goes with its Game plans row.

## Parity evidence

Measured against the original's goldens at 1440 × 960 in
`tests/parity/production-shell.spec.ts`, on one Linux machine, this branch
against `main` (pixels differing out of 1,382,400): Editor 32,435 → 30,754;
More menu 33,726 → 31,735; Export menu 33,651 → 31,970; Save menu 32,583 →
30,902; command palette 33,012 → 31,406; shortcut reference 53,772 → 52,154;
Formations 33,262 → 31,621; Defenses 27,195 → 25,554; Print 31,274 → 31,193;
Demo 22,077 → 22,070; Present unchanged at 106,713. Every state moved toward
the original — the sidebar holds fewer rows and the header fewer words — so no
ratchet moves. Print sits over its macOS-captured ratchet on this machine on
`main` as well, and passes with the CI rasterization delta.

## Evidence

`tests/e2e/one-home-per-control.spec.ts` checks the desktop: the header's
icons, the sidebar without destinations or Play type, the fold opening and
being remembered across a reload, the foot's icons, More's six entries, Help
from the foot, Backup under Settings → Account, and Help and Settings on the
Playbooks and Game Day pages, ending on screenshots.
`tests/e2e/phone-one-home-per-control.spec.ts` checks the phone: More's New
play and Present, the drawer's three 44 px icons, Help as a drawer page, and
the Playbooks header without ≡ or More, ending on a screenshot of the drawer.
