import {
  applyPlayCommand,
  applyPlayCommandWithInverse,
  canonicalStringify,
  coverageCallOf,
  diffPlayDocuments,
  highSchoolFieldProfile,
  playDocumentSchema,
  type MovementPath,
  type PlayDocument,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

/**
 * A Play's unit calls as they are stored (ADR 0075, issue #188). Putting a
 * coverage on, changing it and taking it off are `tests/e2e/unit-calls.spec.ts`.
 * These are the ways storing them could go wrong where that journey would
 * not notice, because it never opens a Play saved by another version:
 *
 * - a Play saved before unit calls no longer loads, or loads with a coverage
 *   or a line's unit call it never had;
 * - a coverage, or the unit call a line came from, is dropped between a save
 *   and a load;
 * - a Play whose coverage a newer Chalk named fails to load on this one,
 *   instead of loading with no coverage this version knows;
 * - undoing the first coverage put on a Play leaves an empty record behind,
 *   so the Play no longer hashes as it did and its undo history is refused.
 */

const play = (extra: Record<string, unknown> = {}): PlayDocument =>
  playDocumentSchema.parse({
    schemaVersion: 3,
    id: "play_unit_calls",
    playbookId: "playbook_unit_calls",
    name: "Under test",
    unit: "defense",
    tags: [],
    notes: "",
    fieldProfile: highSchoolFieldProfile,
    players: [
      {
        id: "fs",
        unit: "defense",
        position: { lateralYards: 0, depthYards: 12 },
        symbol: "triangle",
        label: "F",
        sublabel: "",
        fill: "none",
        color: "ink",
      },
    ],
    assignments: [],
    paths: [],
    labels: [],
    ...extra,
  });

const drop = (extra: Partial<MovementPath> = {}): MovementPath => ({
  id: "fs_drop",
  kind: "zone",
  playerId: "fs",
  points: [
    { lateralYards: 0, depthYards: 12 },
    { lateralYards: 0, depthYards: 16 },
  ],
  branches: [],
  style: { line: "dashed", ending: "bubble", color: "blue" },
  preset: "mid3",
  ...extra,
});

const reloaded = (document: PlayDocument): PlayDocument =>
  playDocumentSchema.parse(JSON.parse(JSON.stringify(document)));

describe("storing a Play's unit calls", () => {
  it("loads a Play saved before unit calls without giving it any", () => {
    const before = play({ paths: [drop()] });
    expect(before).not.toHaveProperty("unitCalls");
    expect(before.paths[0]).not.toHaveProperty("unitCall");
    expect(coverageCallOf(before)).toBeUndefined();
  });

  it("keeps the coverage and the unit call each line came from through a save and a load", () => {
    const called = play({
      unitCalls: { coverage: "cover3" },
      paths: [drop({ unitCall: "coverage" })],
    });
    const again = reloaded(called);
    expect(again.unitCalls).toEqual({ coverage: "cover3" });
    expect(again.paths[0]!.unitCall).toBe("coverage");
    expect(coverageCallOf(again)?.name).toBe("Cover 3");
  });

  it("loads a Play whose coverage a newer Chalk named, with no coverage this version knows", () => {
    const newer = play({ unitCalls: { coverage: "cover9-match" } });
    expect(newer.unitCalls?.coverage).toBe("cover9-match");
    expect(coverageCallOf(newer)).toBeUndefined();
  });

  it("undoes the first coverage put on a Play back to a Play with no unit calls at all", () => {
    const before = play({ paths: [drop()] });
    const after: PlayDocument = {
      ...before,
      unitCalls: { coverage: "cover3" },
    };
    const { commands } = diffPlayDocuments(before, after, "Cover 3");
    expect(commands).toHaveLength(1);
    const { document, inverse } = applyPlayCommandWithInverse(
      before,
      commands[0]!,
    );
    expect(document.unitCalls).toEqual({ coverage: "cover3" });
    const undone = applyPlayCommand(document, inverse);
    expect(undone).not.toHaveProperty("unitCalls");
    expect(canonicalStringify(undone)).toBe(canonicalStringify(before));
  });
});
