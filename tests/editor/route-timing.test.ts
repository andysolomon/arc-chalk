import {
  canonicalStringify,
  mirrorPlayGeometry,
  resolvePathTiming,
  stickThunderPlay,
} from "@chalk/domain";
import { setRouteTimingCommand } from "@chalk/editor";
import { applyPlayCommand } from "@chalk/domain";
import { describe, expect, it } from "vitest";

describe("route timing authoring", () => {
  it("stores delay, speed, and hold and keeps them through a mirror", () => {
    const path = stickThunderPlay.paths.find((item) => item.id === "rx")!;
    const delay = setRouteTimingCommand(
      stickThunderPlay,
      path.id,
      "delay",
      0.5,
    );
    expect(delay).toBeDefined();
    const delayed = applyPlayCommand(stickThunderPlay, delay!);
    const speed = setRouteTimingCommand(delayed, path.id, "speed", 1.5);
    const sped = applyPlayCommand(delayed, speed!);
    const hold = setRouteTimingCommand(sped, path.id, "hold", 0.6);
    const held = applyPlayCommand(sped, hold!);
    const written = held.paths.find((item) => item.id === "rx")!;
    expect(written.timing).toEqual({
      delayMs: 200,
      holdMs: 600,
      speedMultiplier: 1.5,
    });

    const mirrored = mirrorPlayGeometry(held);
    const again = mirrorPlayGeometry(mirrored);
    expect(
      canonicalStringify(again.paths.find((item) => item.id === "rx")!.timing),
    ).toBe(canonicalStringify(written.timing));
    const player = held.players.find((item) => item.id === written.playerId);
    expect(resolvePathTiming(written, player).speedMultiplier).toBe(1.5);
  });
});
