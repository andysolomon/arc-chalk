import { stickThunderPlay } from "@chalk/domain";
import {
  MemoryIdentity,
  UnavailableIdentity,
  type ConflictInboxItem,
  type SyncOrchestrator,
} from "@chalk/sync";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AccountPanel } from "./account-panel";
import { ConflictInbox } from "./conflict-inbox";

const emptySnapshot = {
  status: "local" as const,
  pendingCount: 0,
  conflictCount: 0,
};

describe("Account panel", () => {
  it("explains that editing still works when cloud is not configured", async () => {
    const user = userEvent.setup();
    const identity = new UnavailableIdentity();
    render(
      <AccountPanel
        identity={identity}
        onKeepLocalData={() => Promise.resolve()}
        onOpenConflicts={() => undefined}
        onRemoveLocalData={() => Promise.resolve()}
        snapshot={emptySnapshot}
        sync={undefined}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByText(/Cloud sign-in is not configured/)).toBeVisible();
    expect(
      screen.getByText(/Editing on this device still works/),
    ).toBeVisible();
  });

  it("sends an invitation-only email code through the identity port", async () => {
    const user = userEvent.setup();
    const identity = new MemoryIdentity({ status: "signed_out" });
    const send = vi.spyOn(identity, "sendEmailCode").mockResolvedValue();
    const verify = vi.spyOn(identity, "verifyEmailCode").mockResolvedValue();
    render(
      <AccountPanel
        identity={identity}
        onKeepLocalData={() => Promise.resolve()}
        onOpenConflicts={() => undefined}
        onRemoveLocalData={() => Promise.resolve()}
        snapshot={{ ...emptySnapshot, status: "signed-out" }}
        sync={undefined}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Account" }));
    expect(
      screen.getByText(/does not use a password or a magic link/),
    ).toBeVisible();
    await user.type(
      screen.getByLabelText("Sign-in email"),
      "coach@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(send).toHaveBeenCalledWith("coach@example.com");
    await screen.findByLabelText("Email verification code");
    await user.type(screen.getByLabelText("Email verification code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify code" }));
    expect(verify).toHaveBeenCalledWith("123456");
  });

  it("offers passkey enrollment after sign-in", async () => {
    const user = userEvent.setup();
    const identity = new MemoryIdentity({
      status: "signed_in",
      identity: { coachId: "coach_1", email: "coach@example.com" },
    });
    const enroll = vi.spyOn(identity, "enrollPasskey").mockResolvedValue();
    render(
      <AccountPanel
        identity={identity}
        onKeepLocalData={() => Promise.resolve()}
        onOpenConflicts={() => undefined}
        onRemoveLocalData={() => Promise.resolve()}
        snapshot={{ ...emptySnapshot, status: "synced" }}
        sync={undefined}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByText(/Signed in as coach@example.com/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Add a passkey" }));
    expect(enroll).toHaveBeenCalled();
  });
});

describe("Conflict Inbox", () => {
  const conflict: ConflictInboxItem = {
    id: "conflict_1",
    playId: stickThunderPlay.id,
    playName: "Stick — Thunder",
    localRevisionId: "revision_local",
    remoteRevisionId: "revision_remote",
    status: "unresolved",
    createdAtMs: 1_786_000_000_000,
    localDocument: { ...stickThunderPlay, name: "Local branch" },
    remoteDocument: { ...stickThunderPlay, name: "Remote branch" },
  };

  it("compares both branches and runs each resolution", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn<SyncOrchestrator["resolveConflict"]>();
    onResolve.mockResolvedValue(undefined);
    render(
      <ConflictInbox
        conflicts={[conflict]}
        onClose={() => undefined}
        onResolve={onResolve}
      />,
    );
    expect(
      screen.getByRole("dialog", { name: "Conflict Inbox" }),
    ).toBeVisible();
    expect(screen.getByText("This device")).toBeVisible();
    expect(screen.getByText("Other device")).toBeVisible();
    expect(
      screen.getByText("Both branches are kept. Unrelated Plays keep syncing."),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Use this device's version" }),
    );
    expect(onResolve).toHaveBeenCalledWith("conflict_1", "local");

    await user.click(
      screen.getByRole("button", { name: "Use the other version" }),
    );
    expect(onResolve).toHaveBeenCalledWith("conflict_1", "remote");

    await user.click(
      screen.getByRole("button", { name: "Keep both as separate Plays" }),
    );
    expect(onResolve).toHaveBeenCalledWith("conflict_1", "keep-both");

    await user.click(screen.getByRole("button", { name: "Combine manually" }));
    await user.click(
      screen.getByRole("button", { name: "Save combined Play" }),
    );
    const combineCall = onResolve.mock.calls.find(
      (call) => call[1] === "combine",
    );
    expect(combineCall?.[0]).toBe("conflict_1");
    const options = combineCall?.[2];
    expect(options?.combined?.id).toBe(stickThunderPlay.id);
  });
});
