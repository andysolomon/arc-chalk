import { registerSW } from "virtual:pwa-register";

import {
  createAppLifecycle,
  type Acknowledgement,
  type AppLifecycle,
  type InstallPromptLike,
  type LifecyclePorts,
} from "./app-lifecycle";

/**
 * Which data this shell understands. Bump it whenever the local database
 * schema or the Play document schema moves, so an older cached shell refuses
 * to open data a newer one already upgraded. Kept here, next to the worker
 * registration, rather than derived at runtime: the point is that a stale
 * shell carries its own number.
 */
export const SHELL_DATA_VERSION = 2;

const SHELL_RECORD_KEY = "chalk.shell.dataVersion";
const ACKNOWLEDGED_KEY = "chalk.shell.acknowledged";
const ACKNOWLEDGEMENTS: readonly Acknowledgement[] = [
  "offline-ready",
  "install",
];

type BeforeInstallPromptEvent = Event & InstallPromptLike;

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

/**
 * Only the shell's own caches are ever cleared. Workbox names them with the
 * precache prefix; anything else in Cache Storage is not Chalk's to remove
 * (and Chalk keeps no data there to begin with).
 */
const isShellCache = (name: string) =>
  name.startsWith("workbox-precache") || name.startsWith("chalk-shell");

export const browserLifecyclePorts: LifecyclePorts = {
  registerShell: (events) =>
    registerSW({
      immediate: true,
      onNeedRefresh: events.onNeedRefresh,
      onOfflineReady: events.onOfflineReady,
      onRegisterError: (error) => {
        // Offline, the browser cannot fetch sw.js to re-register it — but the
        // worker already installed is the one serving this page. Only a page
        // no worker controls has actually lost offline support.
        if (navigator.serviceWorker.controller) return;
        if (navigator.onLine === false) return;
        events.onRegisterError(error);
      },
    }),
  connectivity: {
    isOnline: () => navigator.onLine !== false,
    subscribe(listener) {
      window.addEventListener("online", listener);
      window.addEventListener("offline", listener);
      return () => {
        window.removeEventListener("online", listener);
        window.removeEventListener("offline", listener);
      };
    },
  },
  installPrompt: {
    isInstalled: isStandalone,
    subscribe(listener) {
      const onPrompt = (event: Event) => {
        event.preventDefault();
        listener(event as BeforeInstallPromptEvent);
      };
      const onInstalled = () => listener(undefined);
      window.addEventListener("beforeinstallprompt", onPrompt);
      window.addEventListener("appinstalled", onInstalled);
      return () => {
        window.removeEventListener("beforeinstallprompt", onPrompt);
        window.removeEventListener("appinstalled", onInstalled);
      };
    },
  },
  shellCache: {
    async clearShellCaches() {
      if (!("caches" in globalThis)) return;
      const names = await caches.keys();
      await Promise.all(
        names.filter(isShellCache).map((name) => caches.delete(name)),
      );
    },
    async unregisterWorkers() {
      const registrations =
        (await navigator.serviceWorker?.getRegistrations()) ?? [];
      await Promise.all(registrations.map((r) => r.unregister()));
    },
    reload: () => window.location.reload(),
  },
  shellStatus: {
    isControlled: () => Boolean(navigator.serviceWorker?.controller),
    subscribe(listener) {
      const worker = navigator.serviceWorker;
      if (!worker) return () => undefined;
      worker.addEventListener("controllerchange", listener);
      return () => worker.removeEventListener("controllerchange", listener);
    },
  },
  acknowledgements: {
    read() {
      try {
        const raw = localStorage.getItem(ACKNOWLEDGED_KEY);
        const parsed: unknown = raw === null ? [] : JSON.parse(raw);
        return Array.isArray(parsed)
          ? ACKNOWLEDGEMENTS.filter((key) => parsed.includes(key))
          : [];
      } catch {
        return [];
      }
    },
    write(acknowledged) {
      try {
        localStorage.setItem(ACKNOWLEDGED_KEY, JSON.stringify(acknowledged));
      } catch {
        // Without storage the note simply comes back next time.
      }
    },
  },
  shellRecord: {
    read() {
      try {
        const raw = localStorage.getItem(SHELL_RECORD_KEY);
        const value = raw === null ? NaN : Number(raw);
        return Number.isFinite(value) ? value : undefined;
      } catch {
        return undefined;
      }
    },
    write(dataVersion) {
      try {
        localStorage.setItem(SHELL_RECORD_KEY, String(dataVersion));
      } catch {
        // Private mode without storage still runs; it just cannot remember.
      }
    },
  },
};

export function createBrowserLifecycle(): AppLifecycle {
  return createAppLifecycle({
    ports:
      "serviceWorker" in navigator
        ? browserLifecyclePorts
        : { ...browserLifecyclePorts, registerShell: undefined },
    dataVersion: SHELL_DATA_VERSION,
  });
}
