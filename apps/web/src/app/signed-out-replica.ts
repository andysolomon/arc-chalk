/* eslint-disable @typescript-eslint/require-await */
import { UnauthenticatedError, type CloudReplica } from "@chalk/sync";

export function createSignedOutReplica(): CloudReplica {
  const reject = async (): Promise<never> => {
    throw new UnauthenticatedError("Not signed in.");
  };
  return {
    pushBatch: reject,
    pullAfter: reject,
    getRevision: reject,
    resolveConflict: reject,
    readHead: reject,
  };
}
