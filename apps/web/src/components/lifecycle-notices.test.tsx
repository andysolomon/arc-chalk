import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  idleLifecycleSnapshot,
  type AppLifecycle,
  type LifecycleSnapshot,
} from "../app/app-lifecycle";
import { LifecycleNotices } from "./lifecycle-notices";

function fakeLifecycle(snapshot: Partial<LifecycleSnapshot>) {
  const current: LifecycleSnapshot = { ...idleLifecycleSnapshot, ...snapshot };
  const lifecycle: AppLifecycle = {
    getSnapshot: () => current,
    subscribe: () => () => undefined,
    applyUpdate: vi.fn(() => Promise.resolve()),
    install: vi.fn(() => Promise.resolve()),
    repairShell: vi.fn(() => Promise.resolve()),
    dismissOfflineReady: vi.fn(),
  };
  return lifecycle;
}

describe("LifecycleNotices", () => {
  it("renders nothing while the shell has nothing to say", () => {
    const { container } = render(
      <LifecycleNotices lifecycle={fakeLifecycle({})} saving={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("tells the Coach the device is offline and that work still saves", () => {
    render(
      <LifecycleNotices
        lifecycle={fakeLifecycle({ connectivity: "offline" })}
        saving={false}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Offline. Everything you draw saves on this device",
    );
  });

  it("offers the update explicitly and applies it on click", async () => {
    const lifecycle = fakeLifecycle({ update: "ready" });
    render(<LifecycleNotices lifecycle={lifecycle} saving={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Update now" }));
    expect(lifecycle.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it("holds the update while a save is in flight", () => {
    const lifecycle = fakeLifecycle({ update: "ready" });
    render(<LifecycleNotices lifecycle={lifecycle} saving={true} />);
    expect(screen.getByRole("button", { name: "Update now" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Finishing your save first",
    );
  });

  it("explains a stale cached shell and offers the current version", async () => {
    const lifecycle = fakeLifecycle({ fault: "stale-shell" });
    render(<LifecycleNotices lifecycle={lifecycle} saving={false} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your Plays are safe on this device",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Load current version" }),
    );
    expect(lifecycle.repairShell).toHaveBeenCalledTimes(1);
  });

  it("offers install when the browser can", async () => {
    const lifecycle = fakeLifecycle({ install: "available" });
    render(<LifecycleNotices lifecycle={lifecycle} saving={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(lifecycle.install).toHaveBeenCalledTimes(1);
  });

  it("lets the Coach dismiss the offline-ready note", async () => {
    const lifecycle = fakeLifecycle({ offlineReady: true });
    render(<LifecycleNotices lifecycle={lifecycle} saving={false} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "ready to open without a connection",
    );
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(lifecycle.dismissOfflineReady).toHaveBeenCalledTimes(1);
  });
});
