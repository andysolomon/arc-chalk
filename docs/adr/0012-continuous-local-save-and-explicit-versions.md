---
status: accepted
---

# Save continuously on device and create versions explicitly

Chalk persists every completed editing transaction to the device-local database immediately. Undo history, synchronized immutable revisions, and Coach-named versions are distinct concepts so navigation, network loss, crashes, or automatic synchronization cannot silently discard or mislabel work.

## Consequences

- A completed gesture or committed field edit is one domain transaction and one undo entry.
- Pointer movement and other in-progress interactions remain transient; the final result commits once when the interaction ends.
- Each commit updates the IndexedDB current document within the local save acknowledgement budget.
- Switching Plays, closing the tab, or losing connectivity does not discard committed local work.
- Undo and redo commit new current states and never rewrite immutable revision history.
- Background synchronization may coalesce nearby unsynchronized transactions into one immutable cloud revision without weakening local durability.
- Coaches may create immutable named versions such as `Game Plan Final`; automatic processes cannot rename or overwrite them.
- The editor communicates `Saved on this device` and `Synced to cloud` states. It offers explicit `Sync now` and `Create version` actions instead of an ambiguous durability-oriented Save button.

