import { nextRetryAtMs } from "@chalk/sync";
import { SYNC_BACKOFF_JITTER, SYNC_BACKOFF_MS } from "@chalk/contracts";
import { describe, expect, it } from "vitest";

describe("sync backoff", () => {
  it("keeps jitter inside a window that cannot collapse into an immediate retry", () => {
    const now = 5_000;
    const base = SYNC_BACKOFF_MS[0] ?? 0;
    const low = nextRetryAtMs(0, now, () => 0);
    const high = nextRetryAtMs(0, now, () => 1);
    const floor = Math.round(base * (1 - SYNC_BACKOFF_JITTER));
    const cap = Math.round(base * (1 + SYNC_BACKOFF_JITTER));
    expect(low - now).toBeGreaterThanOrEqual(floor);
    expect(high - now).toBeLessThanOrEqual(cap);
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThan(now);
  });
});
