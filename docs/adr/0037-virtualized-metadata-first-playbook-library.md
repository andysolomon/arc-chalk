---
status: accepted
---

# Virtualize Play libraries and derive thumbnails lazily

Chalk renders large Playbook lists and grids from paged metadata without preloading every Play revision. TanStack Virtual bounds DOM work, while thumbnails are disposable local derivatives generated only near the visible range.

## Consequences

- Play lists and thumbnail grids use TanStack Virtual with fixed-size rows or cards wherever practical.
- Virtual item keys are stable Play IDs rather than indexes.
- Overscan is small, measured on target devices, and never expands to the complete result set.
- Metadata is fetched, synchronized, and stored in bounded pages.
- Full Play revisions load only for a selected Play or a small visible and prefetch window.
- Missing thumbnails show lightweight accessible placeholders rather than blocking navigation.
- A thumbnail cache key includes the Play revision hash, renderer version, Field Profile version, and presentation theme.
- Cached thumbnails live in a separate derived IndexedDB store and can be deleted or rebuilt without changing authoritative data.
- Thumbnail work is lazy, cancelable, and scheduled at idle priority behind input, Play opening, local save, playback, synchronization, and export.
- Scroll position and focused Play identity survive navigation into and back from an editor route.
- Keyboard navigation addresses the logical result set even when most rows are not mounted in the DOM.

