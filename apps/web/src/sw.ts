/// <reference lib="webworker" />
/**
 * Chalk's service worker caches exactly one thing: the versioned application
 * shell — the HTML, the hashed scripts and styles, the icons and the
 * manifest that Vite emits. Plays, revisions, preferences, and the sync queue
 * live in IndexedDB and never pass through here; Convex, Clerk, and any other
 * network traffic go straight to the network untouched. A new deploy installs
 * in the background and waits until the Coach says so, because switching
 * shells mid-edit is the one way an update could cost work.
 */
import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare let self: ServiceWorkerGlobalScope;

// Vite's injectManifest writes the versioned shell entries here.
precacheAndRoute(self.__WB_MANIFEST);
// Earlier shells' precaches are dropped once this one is active.
cleanupOutdatedCaches();

/**
 * Every in-app URL is the shell. Anything under /api, every Share Link under
 * /s/, and anything with a file extension that is not in the precache, is not
 * a navigation Chalk answers for: it falls through to the network.
 *
 * /s/ matters most. A Share Link is served by the separate, strictly
 * sandboxed share shell (share.html) that the host rewrites /s/:id onto, and
 * its content is remote by definition. Handing those navigations the editor
 * shell would break every published link for a Coach who has Chalk installed.
 */
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//, /^\/s\//, /\/[^/?]+\.[^/]+$/],
  }),
);

// The page asks for the switch only after the Coach accepts the update.
self.addEventListener("message", (event) => {
  const data = event.data as { type?: string } | null | undefined;
  if (data?.type === "SKIP_WAITING") void self.skipWaiting();
});

// Once the accepted shell activates it takes the open pages so the reload
// the page performs lands on the new code rather than the old.
clientsClaim();
