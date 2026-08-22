import {
  applyPullAfter,
  applyPushBatch,
  applyResolveConflict,
  readRevision,
  UnauthenticatedError,
  type ReplicaStore,
} from "./engine";
import type { CloudReplica } from "./ports";
import type {
  CloudRevision,
  PullPage,
  PushBatchRequest,
  PushBatchResult,
  ResolveConflictRequest,
  ResolveConflictResult,
} from "@chalk/contracts";

export interface EngineReplicaOptions {
  readonly store: ReplicaStore;
  readonly coachId: () => string | undefined;
  readonly now?: () => number;
  readonly authenticated?: () => boolean;
}

/**
 * Runs the sync protocol against any ReplicaStore. Tests share one store
 * across two devices; Convex wraps the same engine with database tables.
 */
export class EngineCloudReplica implements CloudReplica {
  readonly #store: ReplicaStore;
  readonly #coachId: () => string | undefined;
  readonly #now: () => number;
  readonly #authenticated: () => boolean;

  constructor(options: EngineReplicaOptions) {
    this.#store = options.store;
    this.#coachId = options.coachId;
    this.#now = options.now ?? Date.now;
    this.#authenticated = options.authenticated ?? (() => true);
  }

  #requireCoach(): string {
    if (!this.#authenticated()) {
      throw new UnauthenticatedError("Session is no longer valid.");
    }
    const coachId = this.#coachId();
    if (!coachId) throw new UnauthenticatedError();
    return coachId;
  }

  async pushBatch(request: PushBatchRequest): Promise<PushBatchResult> {
    return applyPushBatch(
      this.#store,
      this.#requireCoach(),
      request,
      this.#now(),
    );
  }

  async pullAfter(cursor: string | null, limit: number): Promise<PullPage> {
    return applyPullAfter(this.#store, this.#requireCoach(), cursor, limit);
  }

  async getRevision(revisionId: string): Promise<CloudRevision | null> {
    return readRevision(this.#store, this.#requireCoach(), revisionId);
  }

  async resolveConflict(
    request: ResolveConflictRequest,
  ): Promise<ResolveConflictResult> {
    return applyResolveConflict(
      this.#store,
      this.#requireCoach(),
      request,
      this.#now(),
    );
  }

  async readHead(): Promise<string> {
    const head = await this.#store.getHead(this.#requireCoach());
    return head.cursor;
  }
}
