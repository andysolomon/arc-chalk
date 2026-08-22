import { nextRetryAtMs } from "@chalk/sync";
import { SYNC_BACKOFF_MS } from "@chalk/contracts";
import { describe, expect, it } from "vitest";

describe("sync backoff", () => {
  it("steps through the published delay table and then stays at the cap", () => {
    const now = 1_000_000;
    const noJitter = () => 0.5;
    expect(nextRetryAtMs(0, now, noJitter) - now).toBe(SYNC_BACKOFF_MS[0]);
    expect(nextRetryAtMs(1, now, noJitter) - now).toBe(SYNC_BACKOFF_MS[1]);
    expect(nextRetryAtMs(5, now, noJitter) - now).toBe(SYNC_BACKOFF_MS[5]);
    expect(nextRetryAtMs(9, now, noJitter) - now).toBe(SYNC_BACKOFF_MS[5]);
  });

  it("applies bounded jitter around the base delay", () => {
    const now = 5_000;
    const low = nextRetryAtMs(0, now, () => 0);
    const high = nextRetryAtMs(0, now, () => 1);
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThan(now);
    expect(high - now).toBeLessThanOrEqual(
      Math.round((SYNC_BACKOFF_MS[0] ?? 0) * 1.2),
    );
  });
});
