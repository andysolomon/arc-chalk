/**
 * The installed application's lifecycle, kept apart from the browser so it
 * can be proven without one: whether Chalk is reachable offline, whether a
 * newer shell is waiting, whether this shell is older than the data it finds,
 * whether the device can install it, and whether the network is there.
 *
 * Every state change is a plain snapshot for `useSyncExternalStore`; every
 * browser surface (service worker, `online`, `beforeinstallprompt`, Cache
 * Storage) arrives through a port so tests can drive it.
 */

export type Connectivity = "online" | "offline";

export type UpdateState =
  /** The shell that is running is the newest one this device has. */
  | "current"
  /** A newer shell is installed and waiting; the Coach chooses when. */
  | "ready"
  /** The Coach accepted; the page reloads once the new shell takes over. */
  | "applying";

export type InstallState =
  /** The browser never offered, or this shell is already running installed. */
  | "unavailable"
  /** The browser is holding an install prompt for the Coach to accept. */
  | "available"
  | "installed";

export type ShellFault =
  /**
   * The cached shell is older than the data on this device: a rollback or a
   * stale cache would otherwise read Plays it does not understand.
   */
  | "stale-shell"
  /** The service worker could not register, so offline will not work. */
  | "register-failed";

export interface LifecycleSnapshot {
  readonly connectivity: Connectivity;
  readonly update: UpdateState;
  readonly install: InstallState;
  /** The shell has been cached once, so the next start works offline. */
  readonly offlineReady: boolean;
  readonly fault?: ShellFault;
  /** Something went wrong during an action; cleared by the next action. */
  readonly error?: string;
}

export interface AppLifecycle {
  readonly getSnapshot: () => LifecycleSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * Hands the page to the waiting shell. Safe only between saves: the caller
   * decides when a commit is not in flight, and the store never reloads on
   * its own.
   */
  readonly applyUpdate: () => Promise<void>;
  readonly install: () => Promise<void>;
  /**
   * Recovery after an incompatible cached shell: forget every cached shell,
   * drop the worker that served it, and start again from the network.
   * Local data is untouched — it lives in IndexedDB, never in a cache.
   */
  readonly repairShell: () => Promise<void>;
  readonly dismissOfflineReady: () => void;
}

export interface ShellRegistrationEvents {
  readonly onNeedRefresh: () => void;
  readonly onOfflineReady: () => void;
  readonly onRegisterError: (error: unknown) => void;
}

export interface InstallPromptLike {
  readonly prompt: () => Promise<unknown>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** The browser surfaces the lifecycle depends on. */
export interface LifecyclePorts {
  /**
   * Registers the shell's service worker; resolves to the function that
   * activates a waiting shell and reloads.
   */
  readonly registerShell?: (
    events: ShellRegistrationEvents,
  ) => (reload: boolean) => Promise<void>;
  readonly connectivity?: {
    readonly isOnline: () => boolean;
    readonly subscribe: (listener: () => void) => () => void;
  };
  readonly installPrompt?: {
    readonly isInstalled: () => boolean;
    /** Fires with the deferred prompt, or with nothing once installed. */
    readonly subscribe: (
      listener: (prompt: InstallPromptLike | undefined) => void,
    ) => () => void;
  };
  readonly shellCache?: {
    readonly clearShellCaches: () => Promise<void>;
    readonly unregisterWorkers: () => Promise<void>;
    readonly reload: () => void;
  };
  /**
   * Records which data version each shell understood, so a rollback to an
   * older cached shell is noticed before it reads anything.
   */
  readonly shellRecord?: {
    readonly read: () => number | undefined;
    readonly write: (dataVersion: number) => void;
  };
}

export interface LifecycleOptions {
  readonly ports: LifecyclePorts;
  /**
   * The newest data version this shell can read. A shell that finds a newer
   * number recorded on the device is stale and must not proceed.
   */
  readonly dataVersion: number;
}

/** A shell with nothing registered: how tests and the demo shell run. */
export const idleLifecycleSnapshot: LifecycleSnapshot = {
  connectivity: "online",
  update: "current",
  install: "unavailable",
  offlineReady: false,
};

export function createAppLifecycle(options: LifecycleOptions): AppLifecycle {
  const { ports, dataVersion } = options;
  const listeners = new Set<() => void>();
  let snapshot: LifecycleSnapshot = {
    ...idleLifecycleSnapshot,
    connectivity:
      ports.connectivity?.isOnline() === false ? "offline" : "online",
    install: ports.installPrompt?.isInstalled() ? "installed" : "unavailable",
  };
  let pendingPrompt: InstallPromptLike | undefined;
  let activateWaitingShell: ((reload: boolean) => Promise<void>) | undefined;

  const publish = (next: Partial<LifecycleSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  };

  // A rollback is detected before anything else; the record is only advanced
  // by a shell that is at least as new as what the device has seen.
  const recorded = ports.shellRecord?.read();
  if (recorded !== undefined && recorded > dataVersion) {
    snapshot = { ...snapshot, fault: "stale-shell" };
  } else if (recorded !== dataVersion) {
    ports.shellRecord?.write(dataVersion);
  }

  ports.connectivity?.subscribe(() => {
    publish({
      connectivity: ports.connectivity?.isOnline() ? "online" : "offline",
    });
  });

  ports.installPrompt?.subscribe((prompt) => {
    pendingPrompt = prompt;
    publish({ install: prompt ? "available" : "installed" });
  });

  if (ports.registerShell) {
    try {
      activateWaitingShell = ports.registerShell({
        onNeedRefresh: () => {
          if (snapshot.update === "current") publish({ update: "ready" });
        },
        onOfflineReady: () => publish({ offlineReady: true }),
        onRegisterError: () => {
          if (!snapshot.fault) publish({ fault: "register-failed" });
        },
      });
    } catch {
      snapshot = { ...snapshot, fault: snapshot.fault ?? "register-failed" };
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async applyUpdate() {
      if (snapshot.update !== "ready" || !activateWaitingShell) return;
      publish({ update: "applying", error: undefined });
      try {
        await activateWaitingShell(true);
      } catch (error) {
        publish({
          update: "ready",
          error:
            error instanceof Error
              ? error.message
              : "Chalk could not switch to the new version.",
        });
      }
    },
    async install() {
      const prompt = pendingPrompt;
      if (!prompt) return;
      publish({ error: undefined });
      try {
        await prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome === "accepted") {
          pendingPrompt = undefined;
          publish({ install: "installed" });
        }
      } catch (error) {
        publish({
          error:
            error instanceof Error
              ? error.message
              : "The browser could not install Chalk.",
        });
      }
    },
    async repairShell() {
      const cache = ports.shellCache;
      if (!cache) return;
      publish({ error: undefined });
      try {
        await cache.unregisterWorkers();
        await cache.clearShellCaches();
        cache.reload();
      } catch (error) {
        publish({
          error:
            error instanceof Error
              ? error.message
              : "Chalk could not clear the cached version.",
        });
      }
    },
    dismissOfflineReady() {
      if (snapshot.offlineReady) publish({ offlineReady: false });
    },
  };
}
