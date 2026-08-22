import { SYNC_BACKOFF_JITTER, SYNC_BACKOFF_MS } from "@chalk/contracts";

export function nextRetryAtMs(
  attempts: number,
  nowMs: number,
  random: () => number = Math.random,
): number {
  const index = Math.min(Math.max(0, attempts), SYNC_BACKOFF_MS.length - 1);
  const base = SYNC_BACKOFF_MS[index] ?? SYNC_BACKOFF_MS[0];
  const jitter = 1 + (random() * 2 - 1) * SYNC_BACKOFF_JITTER;
  return nowMs + Math.round(base * jitter);
}
