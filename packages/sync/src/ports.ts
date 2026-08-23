import type {
  AuthSession,
  CloudRevision,
  PullPage,
  PushBatchRequest,
  PushBatchResult,
  ResolveConflictRequest,
  ResolveConflictResult,
} from "@chalk/contracts";

export type SyncStatus =
  | "local"
  | "syncing"
  | "synced"
  | "offline"
  | "conflict"
  | "signed-out"
  | "revoked";

export interface CloudReplica {
  pushBatch(request: PushBatchRequest): Promise<PushBatchResult>;
  pullAfter(cursor: string | null, limit: number): Promise<PullPage>;
  getRevision(revisionId: string): Promise<CloudRevision | null>;
  resolveConflict(
    request: ResolveConflictRequest,
  ): Promise<ResolveConflictResult>;
  readHead(): Promise<string>;
}

export interface IdentityPort {
  readonly configured: boolean;
  getSession(): AuthSession;
  subscribe(listener: () => void): () => void;
  sendEmailCode(email: string): Promise<void>;
  verifyEmailCode(code: string): Promise<void>;
  signInWithPasskey(): Promise<void>;
  enrollPasskey(): Promise<void>;
  hasPasskey(): boolean;
  signOut(): Promise<void>;
}

export interface SyncHeadWatcher {
  subscribe(onAdvance: (cursor: string) => void): () => void;
}
