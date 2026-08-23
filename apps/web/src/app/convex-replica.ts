import { UnauthenticatedError, type CloudReplica } from "@chalk/sync";
import type { ConvexReactClient } from "convex/react";

function rethrowAuth(error: unknown): never {
  const message = error instanceof Error ? error.message : "Sync failed";
  if (
    /not authenticated/i.test(message) ||
    /unauthorized/i.test(message) ||
    /coach not found/i.test(message)
  ) {
    throw new UnauthenticatedError(message);
  }
  throw error instanceof Error ? error : new Error(message);
}

async function wrap<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    rethrowAuth(error);
  }
}

/**
 * The generated Convex API is produced by `convex codegen`. The adapter talks
 * to named public functions so the rest of the app stays behind CloudReplica.
 */
export function createConvexReplica(client: ConvexReactClient): CloudReplica {
  return {
    pushBatch: (request) =>
      wrap(
        client.mutation(
          "sync:pushBatch" as never,
          request as never,
        ) as ReturnType<CloudReplica["pushBatch"]>,
      ),
    pullAfter: (cursor, limit) =>
      wrap(
        client.query(
          "sync:pullAfter" as never,
          {
            cursor,
            limit,
          } as never,
        ) as ReturnType<CloudReplica["pullAfter"]>,
      ),
    getRevision: (revisionId) =>
      wrap(
        client.query(
          "sync:getRevision" as never,
          {
            revisionId,
          } as never,
        ) as ReturnType<CloudReplica["getRevision"]>,
      ),
    resolveConflict: (request) =>
      wrap(
        client.mutation(
          "sync:resolveConflict" as never,
          request as never,
        ) as ReturnType<CloudReplica["resolveConflict"]>,
      ),
    readHead: async () => {
      const head = await wrap(
        client.query("sync:head" as never, {}) as Promise<{
          cursor: string;
        }>,
      );
      return head.cursor;
    },
  };
}
