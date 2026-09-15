import { useSyncExternalStore } from "react";

import type { AppLifecycle, LifecycleSnapshot } from "../app/app-lifecycle";

/** The shell's own notice, once read, is a word in the status bar. */
const offlineReadyQuiet = (snapshot: LifecycleSnapshot): boolean =>
  snapshot.offlineReady && snapshot.acknowledged.has("offline-ready");

const installQuiet = (snapshot: LifecycleSnapshot): boolean =>
  snapshot.install === "available" && snapshot.acknowledged.has("install");

function lifecycleNoticeCount(snapshot: LifecycleSnapshot): number {
  return [
    snapshot.fault !== undefined,
    snapshot.update !== "current",
    snapshot.connectivity === "offline",
    snapshot.offlineReady && !offlineReadyQuiet(snapshot),
    snapshot.install === "available" && !installQuiet(snapshot),
    snapshot.error !== undefined,
  ].filter(Boolean).length;
}

/**
 * What the installed shell has to say: the network is gone, a new version
 * is waiting, the cached version is older than the data, the browser can
 * install Chalk, or the shell is now cached for offline. Each is a plain
 * notice with one action, and none of them is ever automatic: updating
 * waits for the Coach, and for the save in flight.
 *
 * The two routine ones — install, offline-ready — can be set aside for good
 * on this device (ADR 0051); they then read as a quiet word in the status
 * bar through `LifecycleIndicator`. A fault never condenses: a shell that
 * could not be prepared for offline stays a notice until it is.
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
        <div className="notice shell-fault" role="alert">
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
      {snapshot.install === "available" && !installQuiet(snapshot) ? (
        <div className="notice install" role="status">
          <span>
            Install Chalk to open it from the home screen, even offline.
          </span>
          <span className="notice-actions">
            <button
              className="quiet"
              onClick={lifecycle.dismissInstall}
              title="Keep a small Install in the status bar instead"
              type="button"
            >
              Not now
            </button>
            <button onClick={() => void lifecycle.install()} type="button">
              Install
            </button>
          </span>
        </div>
      ) : null}
      {snapshot.offlineReady && !offlineReadyQuiet(snapshot) ? (
        <div className="notice offline-ready" role="status">
          <span>
            Chalk itself is ready to open without a connection. Whether a game
            plan's plays and images are on this device is checked in Game Day.
          </span>
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

/**
 * The acknowledged routine status, condensed: a green dot and "offline
 * ready" for a cached shell, a quiet Install while the browser still offers
 * one. Neither is a live region — they are stable facts, not news — and
 * neither says anything about a game plan being cached.
 */
export function LifecycleIndicator({
  lifecycle,
}: {
  readonly lifecycle: AppLifecycle;
}) {
  const snapshot = useSyncExternalStore(
    lifecycle.subscribe,
    lifecycle.getSnapshot,
  );
  const ready = offlineReadyQuiet(snapshot) && snapshot.fault === undefined;
  const install = installQuiet(snapshot);
  if (!ready && !install) return null;
  return (
    <>
      {ready ? (
        <span
          className="shell-quiet"
          data-shell-status="offline-ready"
          title="Chalk itself opens without a connection. Game Day checks each prepared plan's plays and images on this device."
        >
          <i aria-hidden="true" />
          offline ready
        </span>
      ) : null}
      {install ? (
        <button
          className="shell-quiet"
          data-shell-status="install"
          onClick={() => void lifecycle.install()}
          title="Install Chalk to open it from the home screen"
          type="button"
        >
          install
        </button>
      ) : null}
    </>
  );
}
