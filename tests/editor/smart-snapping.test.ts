import { nflFieldProfile } from "@chalk/domain";
import { snapPosition, snapRouteEndpoint } from "@chalk/editor";
import { describe, expect, it } from "vitest";

const screenScale = {
  lateralPixelsPerYard: 12,
  depthPixelsPerYard: 12,
} as const;

describe("deterministic smart snapping", () => {
  it("prioritizes the ball and line of scrimmage and returns visible guides", () => {
    const result = snapPosition({
      point: { lateralYards: 0.5, depthYards: 0.5 },
      fieldProfile: nflFieldProfile,
      screenScale,
      settings: { enabled: true, grid: 0.25 },
    });

    expect(result.point).toEqual({ lateralYards: 0, depthYards: 0 });
    expect(result.translation).toEqual({
      lateralYards: -0.5,
      depthYards: -0.5,
    });
    expect(result.guides).toEqual([
      {
        kind: "axis",
        axis: "lateral",
        valueYards: 0,
        source: "ball",
        label: "On the ball",
        strong: true,
      },
      {
        kind: "axis",
        axis: "depth",
        valueYards: 0,
        source: "line-of-scrimmage",
        label: "Line of scrimmage",
        strong: true,
      },
    ]);
  });

  it("uses Field Profile hashes, sidelines, and yard marks before other candidates", () => {
    const rightHash =
      nflFieldProfile.widthYards / 2 - nflFieldProfile.hashInsetYards;
    const result = snapPosition({
      point: { lateralYards: rightHash + 0.4, depthYards: 4.6 },
      fieldProfile: nflFieldProfile,
      references: [
        {
          id: "player-nearer",
          kind: "player",
          label: "H",
          position: {
            lateralYards: rightHash + 0.1,
            depthYards: 4.8,
          },
        },
      ],
      screenScale,
      settings: { enabled: true, grid: 0.25 },
    });

    expect(result.point).toEqual({
      lateralYards: Number(rightHash.toFixed(9)),
      depthYards: 5,
    });
    expect(result.guides.map(({ source }) => source)).toEqual([
      "hash",
      "yard-mark",
    ]);
    expect(result.guides[1]).toMatchObject({
      label: "5 yards",
      strong: true,
    });
  });

  it("ranks nearby alignment before a closer grid point with stable tie breaks", () => {
    const references = [
      {
        id: "player-z",
        kind: "player" as const,
        label: "Z",
        position: { lateralYards: 10.3, depthYards: 7.2 },
      },
      {
        id: "player-a",
        kind: "player" as const,
        label: "A",
        position: { lateralYards: 10.3, depthYards: 7.2 },
      },
    ];
    const request = {
      point: { lateralYards: 10.18, depthYards: 7.12 },
      fieldProfile: { ...nflFieldProfile, minorMarkIntervalYards: 5 },
      references,
      screenScale,
      settings: { enabled: true, grid: 0.25 as const },
    };

    const first = snapPosition(request);
    const reordered = snapPosition({
      ...request,
      references: [...references].reverse(),
    });

    expect(first).toEqual(reordered);
    expect(first.point).toEqual({ lateralYards: 10.3, depthYards: 7.2 });
    expect(first.guides).toMatchObject([
      { source: "alignment", targetId: "player-a", label: "Aligned with A" },
      { source: "alignment", targetId: "player-a", label: "Same depth as A" },
    ]);
  });

  it("finds equal splits and translates a group without changing its spacing", () => {
    const result = snapPosition({
      point: { lateralYards: 0.4, depthYards: 6.1 },
      movingPoints: [
        { lateralYards: 0.4, depthYards: 6.1 },
        { lateralYards: 2.4, depthYards: 8.1 },
      ],
      fieldProfile: nflFieldProfile,
      references: [
        {
          id: "left",
          kind: "player",
          label: "X",
          position: { lateralYards: -4, depthYards: 20 },
        },
        {
          id: "right",
          kind: "route-node",
          label: "route node",
          position: { lateralYards: 4, depthYards: 20 },
        },
      ],
      screenScale,
      settings: { enabled: true, grid: "off" },
    });

    expect(result.point).toEqual({ lateralYards: 0, depthYards: 6 });
    expect(result.guides).toEqual([
      {
        kind: "axis",
        axis: "lateral",
        valueYards: 0,
        source: "ball",
        label: "On the ball",
        strong: true,
      },
      {
        kind: "axis",
        axis: "depth",
        valueYards: 6,
        source: "yard-mark",
        label: "6 yards",
        strong: false,
      },
    ]);
    expect(result.movingPoints).toEqual([
      { lateralYards: 0, depthYards: 6 },
      { lateralYards: 2, depthYards: 8 },
    ]);

    const equalSplit = snapPosition({
      ...resultRequest(12.4),
      references: [
        {
          id: "left",
          kind: "player",
          label: "X",
          position: { lateralYards: 10, depthYards: 20 },
        },
        {
          id: "right",
          kind: "player",
          label: "Z",
          position: { lateralYards: 14, depthYards: 20 },
        },
      ],
      excludeReferenceIds: [],
      fieldProfile: { ...nflFieldProfile, widthYards: 200, hashInsetYards: 10 },
    });
    expect(equalSplit.guides[0]).toMatchObject({
      source: "equal-split",
      label: "Equal split between X and Z",
    });
  });

  it("honors the snap toggle and keeps the activation threshold stable across zoom", () => {
    const disabled = snapPosition({
      ...resultRequest(3.24),
      settings: { enabled: false, grid: 0.25 },
    });
    expect(disabled).toMatchObject({
      point: { lateralYards: 3.24, depthYards: 6.1 },
      guides: [],
      snapped: false,
    });

    const zoomedOut = snapPosition({
      ...resultRequest(10.12),
      screenScale: {
        lateralPixelsPerYard: 4,
        depthPixelsPerYard: 4,
      },
    });
    const zoomedIn = snapPosition({
      ...resultRequest(10.12),
      screenScale: {
        lateralPixelsPerYard: 100,
        depthPixelsPerYard: 100,
      },
    });

    expect(zoomedOut.point.lateralYards).toBe(10);
    expect(zoomedIn.point.lateralYards).toBe(10.12);
  });

  it("suggests and constrains grass-true route angles deterministically", () => {
    const suggested = snapRouteEndpoint({
      origin: { lateralYards: 0, depthYards: 0 },
      point: { lateralYards: 5, depthYards: 5.2 },
      mode: "suggest",
      screenScale,
    });
    const unsnapped = snapRouteEndpoint({
      origin: { lateralYards: 0, depthYards: 0 },
      point: { lateralYards: 5, depthYards: 8 },
      mode: "suggest",
      screenScale,
    });
    const constrained = snapRouteEndpoint({
      origin: { lateralYards: 0, depthYards: 0 },
      point: { lateralYards: 5, depthYards: 8 },
      mode: "constrain",
      screenScale: {
        lateralPixelsPerYard: 18,
        depthPixelsPerYard: 12,
      },
    });

    expect(suggested).toMatchObject({
      snapped: true,
      guide: { angleDegrees: 45, label: "45° route break", strong: false },
    });
    expect(suggested.point.lateralYards).toBe(suggested.point.depthYards);
    expect(unsnapped).toEqual({
      point: { lateralYards: 5, depthYards: 8 },
      snapped: false,
    });
    expect(constrained).toMatchObject({
      snapped: true,
      guide: { angleDegrees: 45, strong: true },
    });
    expect(constrained.point.lateralYards).toBe(constrained.point.depthYards);
  });
});

function resultRequest(lateralYards: number) {
  return {
    point: { lateralYards, depthYards: 6.1 },
    fieldProfile: nflFieldProfile,
    screenScale,
    settings: { enabled: true as const, grid: 0.25 as const },
  };
}
