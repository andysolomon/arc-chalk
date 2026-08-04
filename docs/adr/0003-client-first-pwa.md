---
status: accepted
---

# Build Chalk as a client-first PWA

Chalk uses a Vite-powered React and TypeScript SPA/PWA because its authoritative interaction loop—editing, undo, local persistence, playback, and export—must remain available offline and meet strict latency budgets. A small server API supports identity, synchronization, Share Links, and asset metadata; server rendering is not part of the private editor architecture.

## Consequences

- TanStack Router manages application navigation.
- TanStack Query manages remote server state but never owns the live Play document.
- The service worker provides an installable, versioned application shell and offline asset caching.
- Public Share Links may use a separate lightweight presentation surface if link previews or crawler rendering require it.
- Next.js and other server-first application frameworks are not used for the editor.
