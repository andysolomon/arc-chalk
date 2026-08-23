import { useSyncExternalStore } from "react";

import type { AppLifecycle, LifecycleSnapshot } from "../app/app-lifecycle";

function lifecycleNoticeCount(snapshot: LifecycleSnapshot): number {
  return [
    snapshot.fault !== undefined,
    snapshot.update !== "current",
    snapshot.connectivity === "offline",
    snapshot.offlineReady,
    snapshot.install === "available",
  ].filter(Boolean).length;
}

/**
 * What the installed shell has to say: the network is gone, a new version
 * is waiting, the cached version is older than the data, the browser can
 * install Chalk, or the shell is now cached for offline. Each is a plain
 * notice with one action, and none of them is ever automatic: updating
 * waits for the Coach, and for the save in flight.
 */
export function LifecycleNotices({
  lifecycle,
  saving,
}: {
  readonly lifecycle: AppLifecycle;
  /** A local commit is in flight; the update waits for it to land. */
  readonly saving: boolean;
}) {
  const snapshot = useSyncExternalStore(
    lifecycle.subscribe,
    lifecycle.getSnapshot,
  );
  if (lifecycleNoticeCount(snapshot) === 0) return null;

  return (
    <div
      className="lifecycle-notices"
      data-connectivity={snapshot.connectivity}
    >
      {snapshot.fault === "stale-shell" ? (
        <div className="notice shell-fault" role="alert">
          <span>
            This device has a newer Chalk than the copy the browser kept. Your
            Plays are safe on this device; load the current version before
            editing.
          </span>
          <button onClick={() => void lifecycle.repairShell()} type="button">
            Load current version
          </button>
        </div>
      ) : null}
      {snapshot.fault === "register-failed" ? (
        <div className="notice shell-fault" role="status">
          <span>
            Chalk could not prepare for offline use. Editing still saves on this
            device; you will need a connection to open Chalk next time.
          </span>
          <button onClick={() => void lifecycle.repairShell()} type="button">
            Try again
          </button>
        </div>
      ) : null}
      {snapshot.update !== "current" ? (
        <div className="notice update" role="status">
          <span>
            {snapshot.update === "applying"
              ? "Switching to the new version…"
              : saving
                ? "A new version of Chalk is ready. Finishing your save first."
                : "A new version of Chalk is ready. Your saved work stays on this device."}
          </span>
          <button
            disabled={snapshot.update === "applying" || saving}
            onClick={() => void lifecycle.applyUpdate()}
            type="button"
          >
            Update now
          </button>
        </div>
      ) : null}
      {snapshot.connectivity === "offline" ? (
        <div className="notice offline" role="status">
          <span>
            Offline. Everything you draw saves on this device and syncs when the
            connection returns.
          </span>
        </div>
      ) : null}
      {snapshot.install === "available" ? (
        <div className="notice install" role="status">
          <span>
            Install Chalk to open it from the home screen, even offline.
          </span>
          <button onClick={() => void lifecycle.install()} type="button">
            Install
          </button>
        </div>
      ) : null}
      {snapshot.offlineReady ? (
        <div className="notice offline-ready" role="status">
          <span>Chalk is ready to open without a connection.</span>
          <button onClick={lifecycle.dismissOfflineReady} type="button">
            Dismiss
          </button>
        </div>
      ) : null}
      {snapshot.error ? (
        <p className="lifecycle-error" role="alert">
          {snapshot.error}
        </p>
      ) : null}
    </div>
  );
}
