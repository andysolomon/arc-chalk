import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  idleLifecycleSnapshot,
  type Acknowledgement,
  type AppLifecycle,
  type LifecycleSnapshot,
} from "../app/app-lifecycle";
import { LifecycleIndicator, LifecycleNotices } from "./lifecycle-notices";

function fakeLifecycle(snapshot: Partial<LifecycleSnapshot>) {
  const current: LifecycleSnapshot = { ...idleLifecycleSnapshot, ...snapshot };
  const lifecycle: AppLifecycle = {
    getSnapshot: () => current,
    subscribe: () => () => undefined,
    applyUpdate: vi.fn(() => Promise.resolve()),
    install: vi.fn(() => Promise.resolve()),
    repairShell: vi.fn(() => Promise.resolve()),
    dismissOfflineReady: vi.fn(),
    dismissInstall: vi.fn(),
  };
  return lifecycle;
}

const acknowledged = (...keys: Acknowledgement[]) => new Set(keys);

describe("LifecycleNotices", () => {
  it("holds the update while a save is in flight", () => {
    const lifecycle = fakeLifecycle({ update: "ready" });
    render(<LifecycleNotices lifecycle={lifecycle} saving={true} />);
    expect(screen.getByRole("button", { name: "Update now" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Finishing your save first",
    );
  });

  it("condenses acknowledged routine notices to a quiet status-bar word (issue #73)", () => {
    const lifecycle = fakeLifecycle({
      offlineReady: true,
      install: "available",
      acknowledged: acknowledged("offline-ready", "install"),
    });
    const { container } = render(
      <LifecycleNotices lifecycle={lifecycle} saving={false} />,
    );
    expect(container).toBeEmptyDOMElement();
    render(<LifecycleIndicator lifecycle={lifecycle} />);
    const ready = screen.getByText("offline ready");
    expect(ready).not.toHaveAttribute("role");
    expect(ready).toHaveAttribute("title", expect.stringContaining("Game Day"));
    expect(screen.getByRole("button", { name: "install" })).toBeVisible();
  });

  it("keeps a failed offline preparation loud however much was acknowledged", () => {
    const lifecycle = fakeLifecycle({
      fault: "register-failed",
      offlineReady: true,
      acknowledged: acknowledged("offline-ready"),
    });
    render(<LifecycleNotices lifecycle={lifecycle} saving={false} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "could not prepare for offline use",
    );
    const { container } = render(<LifecycleIndicator lifecycle={lifecycle} />);
    expect(container).toBeEmptyDOMElement();
  });
});
