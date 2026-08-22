import type { IdentityPort, SyncOrchestrator, SyncSnapshot } from "@chalk/sync";
import { useState } from "react";

export function AccountPanel({
  identity,
  sync,
  snapshot,
  onOpenConflicts,
  onKeepLocalData,
  onRemoveLocalData,
}: {
  readonly identity: IdentityPort;
  readonly sync: SyncOrchestrator | undefined;
  readonly snapshot: SyncSnapshot;
  readonly onOpenConflicts: () => void;
  readonly onKeepLocalData: () => Promise<void>;
  readonly onRemoveLocalData: () => Promise<void>;
}) {
  const session = identity.getSession();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<"idle" | "code" | "working" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string>();
  const [signOutOpen, setSignOutOpen] = useState(false);

  const sendCode = () => {
    setPhase("working");
    identity
      .sendEmailCode(email)
      .then(() => {
        setPhase("code");
        setMessage("Enter the six-digit code from your email.");
      })
      .catch((error: unknown) => {
        setPhase("error");
        setMessage(
          error instanceof Error ? error.message : "Could not send a code.",
        );
      });
  };

  const verify = () => {
    setPhase("working");
    identity
      .verifyEmailCode(code)
      .then(() => {
        setPhase("idle");
        setCode("");
        setMessage(undefined);
      })
      .catch((error: unknown) => {
        setPhase("error");
        setMessage(
          error instanceof Error ? error.message : "That code did not match.",
        );
      });
  };

  return (
    <div className="backup-section">
      <button
        aria-expanded={open}
        className="menu-entry"
        onClick={() => setOpen((shown) => !shown)}
        type="button"
      >
        Account
      </button>
      <div className="backup-panel" hidden={!open}>
        {session.status === "signed_in" ? (
          <>
            <p className="version-empty">
              Signed in
              {session.identity.email ? ` as ${session.identity.email}` : ""}.
              Cloud sync is {snapshot.status}.
            </p>
            <button type="button" onClick={() => void sync?.syncNow()}>
              Sync now
            </button>
            <button
              type="button"
              onClick={onOpenConflicts}
              disabled={snapshot.conflictCount === 0}
            >
              Conflict Inbox
              {snapshot.conflictCount > 0 ? ` (${snapshot.conflictCount})` : ""}
            </button>
            {identity.hasPasskey() ? (
              <p className="version-empty">
                A passkey is enrolled on this device.
              </p>
            ) : (
              <button
                type="button"
                onClick={() =>
                  void identity.enrollPasskey().catch((error: unknown) => {
                    setPhase("error");
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "Passkey enrollment failed.",
                    );
                  })
                }
              >
                Add a passkey
              </button>
            )}
            <button type="button" onClick={() => setSignOutOpen(true)}>
              Sign out
            </button>
            {signOutOpen ? (
              <div
                className="sign-out-confirm"
                role="group"
                aria-label="Sign out"
              >
                <p className="version-empty">
                  Keep this device&apos;s Playbooks, or remove local data?
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void onKeepLocalData().then(() => setSignOutOpen(false));
                  }}
                >
                  Keep local data
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void onRemoveLocalData().then(() => setSignOutOpen(false));
                  }}
                >
                  Remove local data
                </button>
              </div>
            ) : null}
          </>
        ) : identity.configured ? (
          <>
            <p className="version-empty">
              Invitation-only. Chalk emails a six-digit code to this device — it
              does not use a password or a magic link.
            </p>
            <label className="backup-field">
              <span>Email</span>
              <input
                aria-label="Sign-in email"
                autoComplete="username"
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                value={email}
              />
            </label>
            {phase === "code" ? (
              <label className="backup-field">
                <span>Code</span>
                <input
                  aria-label="Email verification code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => setCode(event.target.value)}
                  value={code}
                />
              </label>
            ) : null}
            {phase === "code" ? (
              <button
                disabled={code.length !== 6}
                onClick={verify}
                type="button"
              >
                Verify code
              </button>
            ) : (
              <button
                disabled={!email || phase === "working"}
                onClick={sendCode}
                type="button"
              >
                Email me a code
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                void identity.signInWithPasskey().catch((error: unknown) => {
                  setPhase("error");
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "Passkey sign-in failed.",
                  );
                })
              }
            >
              Sign in with a passkey
            </button>
          </>
        ) : (
          <p className="version-empty">
            Cloud sign-in is not configured. Editing on this device still works.
          </p>
        )}
        {message ? (
          <p
            className={`backup-status ${phase === "error" ? "error" : "done"}`}
            role="status"
          >
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
