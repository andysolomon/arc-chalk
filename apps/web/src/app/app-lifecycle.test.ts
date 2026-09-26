import { describe, expect, it, vi } from "vitest";

import {
  createAppLifecycle,
  type Acknowledgement,
  type InstallPromptLike,
  type LifecyclePorts,
  type ShellRegistrationEvents,
} from "./app-lifecycle";

function fakePorts() {
  let installListener:
    ((prompt: InstallPromptLike | undefined) => void) | undefined;
  let events: ShellRegistrationEvents | undefined;
  let record: number | undefined;
  let controlled = false;
  const controlListeners = new Set<() => void>();
  let acknowledged: readonly Acknowledgement[] = [];
  const activate = vi.fn(() => Promise.resolve());
  const cache = {
    clearShellCaches: vi.fn(() => Promise.resolve()),
    unregisterWorkers: vi.fn(() => Promise.resolve()),
    reload: vi.fn(),
  };
  const ports: LifecyclePorts = {
    registerShell: (e) => {
      events = e;
      return activate;
    },
    installPrompt: {
      isInstalled: () => false,
      subscribe: (listener) => {
        installListener = listener;
        return () => undefined;
      },
    },
    shellCache: cache,
    shellRecord: {
      read: () => record,
      write: (v) => {
        record = v;
      },
    },
    shellStatus: {
      isControlled: () => controlled,
      subscribe: (listener) => {
        controlListeners.add(listener);
        return () => controlListeners.delete(listener);
      },
    },
    acknowledgements: {
      read: () => acknowledged,
      write: (next) => {
        acknowledged = next;
      },
    },
  };
  return {
    ports,
    activate,
    cache,
    acknowledged: () => acknowledged,
    setControlled(next: boolean) {
      controlled = next;
      for (const l of controlListeners) l();
    },
    events: () => events!,
    offerInstall(prompt: InstallPromptLike | undefined) {
      installListener?.(prompt);
    },
    record: () => record,
    setRecord(v: number | undefined) {
      record = v;
    },
  };
}

describe("app lifecycle", () => {
  it("reports a waiting shell and only switches when asked", async () => {
    const fake = fakePorts();
    const lifecycle = createAppLifecycle({ ports: fake.ports, dataVersion: 1 });
    fake.events().onNeedRefresh();
    expect(lifecycle.getSnapshot().update).toBe("ready");
    expect(fake.activate).not.toHaveBeenCalled();

    await lifecycle.applyUpdate();
    expect(fake.activate).toHaveBeenCalledWith(true);
    expect(lifecycle.getSnapshot().update).toBe("applying");
  });

  it("keeps the update offered when switching fails", async () => {
    const fake = fakePorts();
    fake.activate.mockRejectedValueOnce(new Error("worker went away"));
    const lifecycle = createAppLifecycle({ ports: fake.ports, dataVersion: 1 });
    fake.events().onNeedRefresh();
    await lifecycle.applyUpdate();
    expect(lifecycle.getSnapshot()).toMatchObject({
      update: "ready",
      error: "worker went away",
    });
  });

  it("flags a cached shell older than the data already on the device", () => {
    const fake = fakePorts();
    fake.setRecord(5);
    const lifecycle = createAppLifecycle({ ports: fake.ports, dataVersion: 4 });
    expect(lifecycle.getSnapshot().fault).toBe("stale-shell");
    // The stale shell never lowers the record: the data is still version 5.
    expect(fake.record()).toBe(5);
  });

  it("advances the record when a newer shell opens older data", () => {
    const fake = fakePorts();
    fake.setRecord(1);
    const lifecycle = createAppLifecycle({ ports: fake.ports, dataVersion: 2 });
    expect(lifecycle.getSnapshot().fault).toBeUndefined();
    expect(fake.record()).toBe(2);
  });

  it("repairs a stale shell by dropping workers and caches, then reloading", async () => {
    const fake = fakePorts();
    fake.setRecord(9);
    const lifecycle = createAppLifecycle({ ports: fake.ports, dataVersion: 1 });
    await lifecycle.repairShell();
    expect(fake.cache.unregisterWorkers).toHaveBeenCalledTimes(1);
    expect(fake.cache.clearShellCaches).toHaveBeenCalledTimes(1);
    expect(fake.cache.reload).toHaveBeenCalledTimes(1);
  });

  it("reports a registration failure without blocking the editor", () => {
    const fake = fakePorts();
    const lifecycle = createAppLifecycle({ ports: fake.ports, dataVersion: 1 });
    fake.events().onRegisterError(new Error("no worker"));
    expect(lifecycle.getSnapshot().fault).toBe("register-failed");
  });

  it("marks the shell offline-ready and remembers that the Coach has read it", () => {
    const fake = fakePorts();
    const lifecycle = createAppLifecycle({ ports: fake.ports, dataVersion: 1 });
    fake.events().onOfflineReady();
    expect(lifecycle.getSnapshot().offlineReady).toBe(true);
    expect(lifecycle.getSnapshot().acknowledged.has("offline-ready")).toBe(
      false,
    );
    lifecycle.dismissOfflineReady();
    // The fact stays; only the note is set aside, on this device for good.
    expect(lifecycle.getSnapshot().offlineReady).toBe(true);
    expect(lifecycle.getSnapshot().acknowledged.has("offline-ready")).toBe(
      true,
    );
    expect(fake.acknowledged()).toEqual(["offline-ready"]);
    const next = createAppLifecycle({ ports: fake.ports, dataVersion: 1 });
    expect(next.getSnapshot().acknowledged.has("offline-ready")).toBe(true);
  });

  it("is offline-ready on a later start when the cached shell already serves the page", () => {
    const fake = fakePorts();
    expect(
      createAppLifecycle({ ports: fake.ports, dataVersion: 1 }).getSnapshot()
        .offlineReady,
    ).toBe(false);
    fake.setControlled(true);
    expect(
      createAppLifecycle({ ports: fake.ports, dataVersion: 1 }).getSnapshot()
        .offlineReady,
    ).toBe(true);
  });

  it("sets the install offer aside without losing the prompt", async () => {
    const fake = fakePorts();
    const lifecycle = createAppLifecycle({ ports: fake.ports, dataVersion: 1 });
    const prompt: InstallPromptLike = {
      prompt: vi.fn(() => Promise.resolve()),
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    };
    fake.offerInstall(prompt);
    lifecycle.dismissInstall();
    expect(lifecycle.getSnapshot().install).toBe("available");
    expect(lifecycle.getSnapshot().acknowledged.has("install")).toBe(true);
    await lifecycle.install();
    expect(prompt.prompt).toHaveBeenCalledTimes(1);
    expect(lifecycle.getSnapshot().install).toBe("installed");
  });
});
