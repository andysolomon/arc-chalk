---
status: accepted
---

# On a phone the Playbooks pages scroll the document

Chalk lays out as an app shell: `html`, `body` and `#root` are pinned to the screen
with `overflow: hidden`, and each page scrolls a box inside it. Safari on an iPhone,
and other phone browsers, fold the address bar away only when the document itself
scrolls. On a phone the bar never folded. The Playbooks list got about a third of
the screen (314 of 664 px on an iPhone 14) under the header, the page's tabs, the
book's bar, search and the filters, while other sites give their content the whole
screen once the Coach scrolls.

Product request (2026-09-27): scrolling a page on an iPhone should fold the URL bar
away, as it does on other sites.

## Decision

**Below the editor's floor, the Playbooks pages scroll the document.** The shelf, the
book's Plays and Game plans, Formations and Plays drop their own scroll boxes, and
the page grows to its content. The phone header is pinned to the top
(`position: sticky`). Everything under it (the page's tabs, the book's bar, search,
filters) scrolls away with the list. The shell carries `phone-page`, and the rules
that release `html`, `body` and `#root` apply only with it (`html:has(.phone-page)`),
so the tablet and desktop layouts are unchanged.

**The Plays list is still virtualized (ADR 0037), against the window.**
`PlaybookBrowser` takes `pageScroll`. With it, a window virtualizer takes over from
the element one. Its scroll margin is where the list starts on the page, and its
scroll padding is the pinned header's height. Both are read again whenever the page
changes size. The scroll position the browser remembers is still the list's own:
the window's scroll less the list's start.

**Each page opens at its top.** Changing destination, page or book tab scrolls the
window to the top before the Plays list restores its own place.

**The editor and the Game Day reader keep their pinned shells.** The editor's field
takes the drag, so there is nothing to scroll. The reader's contract is that the call,
its code and Previous / Next stay on the screen, held upright or sideways (issue #95).
Neither folds the bar. On a phone that should show no bar at all, Chalk is added to
the Home Screen, where it opens standalone (its manifest asks for `display: standalone`).

## Evidence

`tests/e2e/phone-page-scroll.spec.ts` runs at 390 × 844. It adds sixteen plays to the
starter book and checks the following. The document scrolls on the Plays and
Formations pages and the list box does not. Fewer rows are mounted than the list
holds. At the bottom, the header is at the top of the screen and the last row is
visible below it, with no row laid over another. Formations and the editor open at
the top, and the editor does not scroll. It saves `phone-plays-scrolled.png`. The
spec fails on the previous layout, where the page is exactly the screen's height.
It was run under Chromium phone emulation only. The physical iPhone check is still
owed.
