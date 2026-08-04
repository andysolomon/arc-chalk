---
status: accepted
---

# Cache only the PWA shell and keep application data in IndexedDB

Chalk uses `vite-plugin-pwa` with a custom Workbox `injectManifest` service worker. Cache Storage owns only the versioned application shell and packaged render assets; IndexedDB remains the sole device-local application database.

## Consequences

- The service worker precaches hashed JavaScript, CSS, HTML, icons, fonts, renderer assets, and print templates required for offline launch.
- Playbooks, Plays, revisions, mutation queues, conflicts, preferences, and image blobs live in typed IndexedDB repositories rather than Cache Storage.
- Convex traffic and private R2 signed URLs bypass runtime caching.
- Share Publication data is network-only and is not silently retained by a recipient's service worker.
- Chalk does not rely on the browser Background Sync API; the application sync service drains the IndexedDB queue while launched, focused, or reconnected.
- A newly downloaded service worker presents an `Update ready` action rather than activating automatically.
- Update activation waits until no gesture, domain transaction, migration, or export is active.
- Client and backend compatibility is checked before activation, and the prior cached shell remains until the new version opens successfully.
- Chalk requests persistent browser storage after a Coach creates or imports a first Playbook.
- Denied persistence produces a clear eviction-risk explanation and encrypted-backup recommendation without blocking work.
- Offline launch, service-worker upgrades, cache cleanup, and recovery are tested in installed and ordinary browser-tab modes.

