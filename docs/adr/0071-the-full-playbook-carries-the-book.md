---
status: accepted
---

# The Full playbook carries the book

A Coach printing a named book (ADR 0062) got a cover that said only **Playbook**, a
contents page in no order he had chosen, and an assignment table that called every
block a **Block** (issue #156). His Cobb Comets defense, sorted by name on the book's
page, printed D807, D803, D808 — the order the plays sat in on disk — and his O303 24
Lead and O304 28 Stretch printed alike, though one line drives and the other reaches.

Three things were wrong at once. `playbookHtml` hard-coded its cover and titled the
document for the product; the Print & export binder titled it **Full playbook**. Both
took the plays as the repository returned them and, in the editor's own Print menu,
regrouped them by Concept, so the sort on the book's page never reached paper. And the
words for a block came from its kind rather than its call: a call put on the line had
been named for its key since issue #161, but only in the table, and a line drawn as a
call before the key was kept on the line (issue #108) had nothing to be named for.

## Decision

**A book prints under its own name.** The cover, the document's title and the foot of
every sheet carry the book's name — the same name the book's page and the shelf show —
in the editor's Print → Full playbook and in the Print & export binder alike. A second
book prints under its own name, not the first's. "Playbook" is only what a book with no
name is called.

**The pages turn in the book's install order, else the way its page reads, unless the
Coach says otherwise.** A book whose Coach has set an install order (ADR 0064, organizing
a library) prints in it, as that ADR decided: it is the order the staff teaches the
plays in. Until one is set, a Full playbook starts in the order its page is sorted in: by
name, or most recently edited first. That is what the Coach is looking at when he chooses
to print, so it is what the contents runs in, where ADR 0064 kept library order. The page
reads by name until he chooses otherwise, so an unset sort prints by name too. Print &
export adds an **Order** choice to the Full playbook source — **Install order** when the
book has one, Name, Recently edited, or **Library order — by concept**, the grouped order
every library output reads in — and the source line, the note and the contents page say
which order is in use ("in install order", "in name order", "most recently edited
first", "in library order"). The page's sorts are the page's own: the book's plays are
put in order by the same `sortPlays` the page uses, read off the same projections, so the
paper matches the screen exactly. The order is a value naming the sort (`PlaybookOrder`),
not a flag beside the plays.

**Contents headings follow the order.** In library order the contents groups a
Concept's plays under its name, as before. In the page's own sorts a Concept's plays
may be pages apart, so the Concept is named beside each play instead of heading them.

**A block is named for its call wherever it is listed.** A quick block — Drive, Reach,
Pass set, Down, the pulls, Trap, Cut, Chip — reads as that call in the install table,
in the roster and in the Player panel's list of his lines, the way a quick route is
named (ADR 0064, route names). The Coach's own words still win, as they do for a route.
A block that carries no key but still has the exact shape of a catalogue call from the
man's stance — one drawn before the key was kept — is that call all the same, and is
read off the shape. A block that matches no call was drawn by hand, and is only a block.
The field is left as the original draws it: a route's name sits at its end, where
routes end apart, but five linemen's blocks end a yard apart and five words there
collide into a smear, so a block's call is not written under the line.

## Stored

Nothing new. The print order is chosen at print time and never written; the book's
page keeps its sort as it did. Play documents are unchanged: the shape-read of a
keyless block is a reading, not a rewrite.

## Evidence

`tests/e2e/playbook-print-identity.spec.ts`, at 1440 × 960, names the blank device's
book Cobb Comets Offense and makes three plays in an order that is neither their name
order nor its reverse, giving the whole line Reach, Pass set and Drive in turn. The
roster reads Drive for each of the five linemen. With
the book's page sorted most recently edited first, Print & export's Full playbook says
so and lists the plays that way; sorted by name, the cover reads the book's name, the
contents runs O301, O303, O304 and says "in name order", the install pages read Drive,
Reach and Pass set five times each, and no cell reads "Block". The Order choice
switches the same preview to library order and back. The editor's own Print → Full
playbook opens the same book: named on the cover, in the title and in the foot of
every sheet, in name order. A second book, Comets JV, prints under its own name. The
spec saves the printed HTML of each book (`cobb-comets-offense-by-name.html`,
`cobb-comets-offense-print-menu.html`, `comets-jv.html`) and ends with a screenshot of
the Print & export page. It also fixes the e2e fixtures to clear the device from the
top frame only: the Print preview is an iframe, and the reset script ran again inside
it, deleting the library under the app.
