---
status: accepted
---

# Playbooks saved by name

ADR 0060 put every Playbook on the device on a shelf, but a Coach could not make one:
a book appeared only as the starter or as the blank `Playbook` a first Play opened, and
nothing renamed either. With every book called the same thing, the shelf and the
Playbook filter on the Formations and Plays pages could not tell them apart.

## Decision

**The shelf saves a new book by name.** A name field and **Save** head the shelf.
Saving writes an empty Playbook under that name (`createPlaybook` on the runtime, with
the field profile and Play types of `blankPlaybook`) and opens it the way the shelf's
**Open** does: the runtime reads from it from then on, and the editor takes up a blank
Play in it.

**The open book's bar renames it.** **Rename** beside the book's name turns the name
into the same field, filled with the current name. **Save** writes the name to the
Playbook record, and the shelf and every Playbook filter show it once the library
reloads. **Cancel** or Escape closes the field without saving, and going back to the
shelf does too.

**A name belongs to one book on the device.** A book is found by its name, so both
fields refuse a name another book already uses. Case and repeated spaces are ignored
when comparing names. The field is marked invalid and names the book that already has
the name. Saving trims the name and collapses its spaces. Save stays off for an empty
name and, when renaming, for the name the book already has.

The name is stored on the local Playbook record, like the field profiles, Play types
and coverage depths the Coach already saves there. This ADR does not change how
Playbook records reach the cloud replica.

## Evidence

`tests/e2e/playbook-names.spec.ts`, at 1440 × 960 and on the iPad, refuses the starter
book's name in either case, saves and opens a new book under a trimmed name, renames it
from the bar, refuses another book's name there, drops a rename on Escape, and opens
Chalk again in a new tab to find both books on the shelf by name, with the renamed one
still open. It ends with a screenshot of that shelf in the test's output folder.
