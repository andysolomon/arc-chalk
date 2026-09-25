---
status: accepted
---

# Phones open in the editor (amends ADR 0045)

ADR 0045 has a screen below the editor's floor (`EDITOR_MIN_SCREEN`, 668 × 440) open
on a reading shell: the Play, the three destinations, a _Read only_ chip and an **Edit on
this screen** control whose answer lasts for the session. Issue #92 then gave that
answer a real phone workspace — a two-row header, the tools in a tray along the bottom,
the inspector as a sheet.

The session is the problem. A phone browser reloads a page it put in the background, so
a Coach who switches to his messages and comes back loses the answer and lands on the
reading shell again, one tap away from the work he was doing — every time.

Product decision (2026-09-25): a phone opens straight into the phone workspace, and the
reading shell is gone.

## Decision

**No gate below the floor.** The floor still decides the layout — the phone workspace
below it, the tablet and desktop layouts above — but not whether the Coach may edit.
There is no _Read only_ chip, no **Edit on this screen**, and no _Read only_ button in
the phone header. Turning the phone over or resizing a Split View moves between layouts
without a reload, and a screen that becomes a phone still starts from the whole field.

**Where he left off.** A reload reopens the Play he last changed (the runtime already
opens the most recently updated one) with its undo history, and Game Day when he left
Chalk on Game Day; now it also reopens ready to draw.

**The phone header on every destination.** The reading shell's compact header was what
Playbooks and Game Day wore on a phone. The phone workspace's two-row header now carries
the `phone-topbar` class itself, so every destination below the floor wears it rather
than the desktop header squeezed into a phone.

## Consequences

- A thumb on the glass can move a man on a phone, as it can on a tablet; Undo is in the
  header on every screen. The sideline reader for what was called is Game Day, which
  shows a Prepared Revision and never the live Play.
- The field's outline list (`Everything on the field`) stays, as it is part of the
  editor on every screen.
