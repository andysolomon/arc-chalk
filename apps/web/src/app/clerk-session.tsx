import { useAuth, useClerk, useSignIn, useUser } from "@clerk/react";
import { canonicalSha256 } from "@chalk/domain";
import { useConvex, useQuery } from "convex/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createSyncOrchestrator,
  rememberCoachId,
  storedCoachId,
  type SyncOrchestrator,
} from "@chalk/sync";

import type { ChalkRuntime } from "./editor-runtime";
import { BridgedIdentity, signedIn } from "./identity-bridge";
import { createConvexReplica } from "./convex-replica";
import type { CloudSession } from "./cloud-session";

function isSyncHead(value: unknown): value is { readonly cursor: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "cursor" in value &&
    typeof Reflect.get(value, "cursor") === "string"
  );
}

function SyncHeadSignal({
  enabled,
  onAdvance,
}: {
  readonly enabled: boolean;
  readonly onAdvance: (cursor: string) => void;
}) {
  const head: unknown = useQuery("sync:head" as never, enabled ? {} : "skip");
  useEffect(() => {
    if (isSyncHead(head)) onAdvance(head.cursor);
  }, [head, onAdvance]);
  return null;
}

export function ClerkWiredSession({
  runtime,
  children,
}: {
  readonly runtime: ChalkRuntime;
  readonly children: (session: CloudSession) => ReactNode;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const { signIn } = useSignIn();
  const { user } = useUser();
  const convex = useConvex();
  const replica = useMemo(() => createConvexReplica(convex), [convex]);
  const [sync, setSync] = useState<SyncOrchestrator>();
  const [headCursor, setHeadCursor] = useState<string>();
  const advanceHead = useRef<(cursor: string) => void>(() => undefined);
  const signInRef = useRef(signIn);
  const signOutRef = useRef(signOut);
  const userRef = useRef(user);

  useEffect(() => {
    signInRef.current = signIn;
    signOutRef.current = signOut;
    userRef.current = user;
  }, [signIn, signOut, user]);

  const identity = useMemo(() => {
    const bridged = new BridgedIdentity(true, { status: "loading" });
    bridged.sendEmailCodeImpl = async (email: string) => {
      const current = signInRef.current;
      if (!current) throw new Error("Sign-in is not ready.");
      const result = await current.emailCode.sendCode({ emailAddress: email });
      if (result.error) {
        throw new Error(result.error.message ?? "Could not send a code.");
      }
    };
    bridged.verifyEmailCodeImpl = async (code: string) => {
      const current = signInRef.current;
      if (!current) throw new Error("Sign-in is not ready.");
      const verified = await current.emailCode.verifyCode({ code });
      if (verified.error) {
        throw new Error(verified.error.message ?? "That code did not match.");
      }
      const finalized = await current.finalize({
        navigate: () => Promise.resolve(),
      });
      if (finalized.error) {
        throw new Error(finalized.error.message ?? "Could not finish sign-in.");
      }
    };
    bridged.signInWithPasskeyImpl = async () => {
      const current = signInRef.current;
      if (!current) throw new Error("Sign-in is not ready.");
      const result = await current.passkey({ flow: "discoverable" });
      if (result.error) {
        throw new Error(result.error.message ?? "Passkey sign-in failed.");
      }
      const finalized = await current.finalize({
        navigate: () => Promise.resolve(),
      });
      if (finalized.error) {
        throw new Error(finalized.error.message ?? "Could not finish sign-in.");
      }
    };
    bridged.enrollPasskeyImpl = async () => {
      const currentUser = userRef.current;
      if (!currentUser) throw new Error("Sign in before adding a passkey.");
      await currentUser.createPasskey();
    };
    bridged.signOutImpl = async () => {
      await signOutRef.current();
    };
    return bridged;
  }, []);

  useEffect(() => {
    if (headCursor === undefined) return;
    advanceHead.current(headCursor);
  }, [headCursor]);

  const onHeadAdvance = useCallback((cursor: string) => {
    setHeadCursor(cursor);
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      identity.setSession({ status: "loading" });
      return;
    }
    if (!isSignedIn || !user) {
      identity.setSession({ status: "signed_out" });
      return;
    }

    let cancelled = false;
    identity.setSession({ status: "loading" });
    void (async () => {
      const existingCoachId = await storedCoachId(runtime.repository);
      let email =
        user.primaryEmailAddress?.emailAddress ??
        user.emailAddresses[0]?.emailAddress;
      let coachId: string | undefined;
      try {
        const stored = (await convex.mutation(
          "coaches:storeCoach" as never,
          {
            ...(existingCoachId === undefined ? {} : { existingCoachId }),
          } as never,
        )) as { coachId: string; email?: string };
        coachId = stored.coachId;
        email = stored.email ?? email;
      } catch {
        coachId =
          existingCoachId ??
          `coach_${user.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32)}`;
      }
      if (cancelled || !coachId) return;
      await rememberCoachId(runtime.repository, coachId, Date.now());
      identity.setSession(
        signedIn({
          coachId,
          clerkSubject: user.id,
          ...(email === undefined ? {} : { email }),
        }),
      );
      identity.setPasskey((user.passkeys?.length ?? 0) > 0);
    })().catch(() => {
      if (!cancelled) identity.setSession({ status: "signed_out" });
    });

    return () => {
      cancelled = true;
    };
  }, [convex, identity, isLoaded, isSignedIn, runtime.repository, user]);

  useEffect(() => {
    let halt: (() => void) | undefined;
    let cancelled = false;
    void createSyncOrchestrator({
      repository: runtime.repository,
      replica,
      identity,
      currentPlayId: () => runtime.editorStore.getSnapshot().document.id,
      onOpenPlayChanged: (play) => {
        void canonicalSha256(play).then((hash) => {
          runtime.editorStore.revealPersistedPlay(play, hash);
        });
      },
      headWatcher: {
        subscribe(onAdvance) {
          advanceHead.current = onAdvance;
          return () => {
            advanceHead.current = () => undefined;
          };
        },
      },
    }).then((orchestrator) => {
      if (cancelled) return;
      setSync(orchestrator);
      const stopOrchestrator = orchestrator.start();
      const unsub = runtime.subscribeLocalEdit(() =>
        orchestrator.notifyLocalEdit(),
      );
      halt = () => {
        unsub();
        stopOrchestrator();
      };
    });
    return () => {
      cancelled = true;
      halt?.();
    };
  }, [identity, replica, runtime]);

  return (
    <>
      <SyncHeadSignal enabled={Boolean(isSignedIn)} onAdvance={onHeadAdvance} />
      {/* The identity port is stable. Its methods read Clerk handles from refs only when the Coach signs in. */}
      {/* eslint-disable-next-line react-hooks/refs */}
      {children({ identity, sync })}
    </>
  );
}
