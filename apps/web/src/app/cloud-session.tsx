import type { IdentityPort, SyncOrchestrator } from "@chalk/sync";
import { createSyncOrchestrator } from "@chalk/sync";
import { canonicalSha256 } from "@chalk/domain";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ChalkRuntime } from "./editor-runtime";
import { BridgedIdentity } from "./identity-bridge";
import { createSignedOutReplica } from "./signed-out-replica";

export interface CloudSession {
  readonly identity: IdentityPort;
  readonly sync?: SyncOrchestrator;
}

export function CloudSessionHost({
  runtime,
  children,
}: {
  readonly runtime: ChalkRuntime;
  readonly children: (session: CloudSession) => ReactNode;
}) {
  const identity = useMemo(
    () => new BridgedIdentity(false, { status: "unavailable" }),
    [],
  );
  const replica = useMemo(() => createSignedOutReplica(), []);
  const [sync, setSync] = useState<SyncOrchestrator>();

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
    }).then((orchestrator) => {
      if (cancelled) return;
      setSync(orchestrator);
      const stopOrchestrator = orchestrator.start();
      const unsub = runtime.subscribeLocalEdit(() => {
        orchestrator.notifyLocalEdit();
      });
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

  return <>{children({ identity, sync })}</>;
}
