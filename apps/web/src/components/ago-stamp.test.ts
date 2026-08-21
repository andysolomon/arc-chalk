import { describe, expect, it } from "vitest";

import { agoStamp } from "./ago-stamp";

const now = 1_700_000_000_000;

describe("agoStamp", () => {
  it("matches the original's History buckets", () => {
    expect(agoStamp(now, now)).toBe("just now");
    expect(agoStamp(now - 44_000, now)).toBe("just now");
    expect(agoStamp(now - 45_000, now)).toBe("1 min ago");
    expect(agoStamp(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(agoStamp(now - 59 * 60_000, now)).toBe("59 min ago");
    expect(agoStamp(now - 60 * 60_000, now)).toBe("1 hour ago");
    expect(agoStamp(now - 2 * 60 * 60_000, now)).toBe("2 hours ago");
    expect(agoStamp(now - 24 * 60 * 60_000, now)).toBe("1 day ago");
    expect(agoStamp(now - 3 * 24 * 60 * 60_000, now)).toBe("3 days ago");
  });
});
