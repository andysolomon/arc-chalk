import { revisionRows } from "@chalk/domain";
import { describe, expect, it } from "vitest";

import {
  callMatches,
  flatten,
  markCalled,
  markResult,
  planReadiness,
  readGameDayState,
  setNote,
  toggleFavorite,
  emptyRevisionNotes,
} from "./game-day-state";
import { hundredCallPlan } from "./game-day-fixture";

describe("finding a call on the sideline (issue #67)", () => {
  it("answers to a code by prefix before a name, and to any word of a name", () => {
    const { revision } = hundredCallPlan();
    const rows = flatten(revisionRows(revision));
    expect(rows).toHaveLength(100);
    const twelve = rows.filter((row) => callMatches(row, "12"));
    expect(twelve.map((row) => row.code)).toEqual(["12"]);
    const ones = rows.filter((row) => callMatches(row, "1"));
    for (const row of ones) {
      expect(row.code.startsWith("1") || row.name.includes("1")).toBe(true);
    }
    const codes = ones.map((row) => row.code);
    for (const code of ["1", "10", "15", "19", "100"]) {
      expect(codes).toContain(code);
    }
    expect(codes).not.toContain("2");
    const byName = rows.filter((row) => callMatches(row, "stick"));
    expect(byName.length).toBeGreaterThan(0);
    expect(byName.every((row) => /stick/i.test(row.name))).toBe(true);
    expect(rows.filter((row) => callMatches(row, ""))).toHaveLength(100);
  });
});

describe("what the coordinator writes on the device", () => {
  it("keeps stars, notes and marks apart from the play and reads back what it wrote", () => {
    let notes = emptyRevisionNotes;
    notes = toggleFavorite(notes, "c1");
    notes = setNote(notes, "c1", "Check the Mike");
    notes = markCalled(markCalled(notes, "c1"), "c1");
    notes = markResult(notes, "c1", "score");
    expect(notes.favorites).toEqual(["c1"]);
    expect(notes.marks.c1).toEqual({ called: 2, result: "score" });
    notes = setNote(notes, "c1", "  ");
    expect(notes.notes.c1).toBeUndefined();
    expect(toggleFavorite(notes, "c1").favorites).toEqual([]);

    const stored = readGameDayState({
      place: {
        planId: "p",
        revisionId: "r",
        section: "favorites",
        callId: "c1",
        query: "1",
        layout: "grid",
      },
      revisions: {
        r: {
          favorites: ["c1", 3],
          notes: { c1: "x", c2: 4 },
          marks: { c1: { called: 1, result: "bogus" } },
        },
      },
    });
    expect(stored.place).toEqual({
      planId: "p",
      revisionId: "r",
      section: "favorites",
      callId: "c1",
      query: "1",
      layout: "grid",
    });
    expect(stored.revisions.r).toEqual({
      favorites: ["c1"],
      notes: { c1: "x" },
      marks: { c1: { called: 1 } },
    });
    expect(readGameDayState("junk")).toEqual({ revisions: {} });
  });
});

describe("whether a plan is ready without a connection", () => {
  it("counts the calls when everything is here, and names what is missing otherwise", async () => {
    const { revision } = hundredCallPlan();
    const ready = await planReadiness(revision, () => Promise.resolve(true));
    expect(ready).toEqual({
      ready: true,
      callCount: 100,
      missingPlays: [],
      missingImages: [],
    });

    const withImage = {
      ...revision,
      plays: revision.plays.map((play, index) =>
        index === 0
          ? {
              ...play,
              document: {
                ...play.document,
                attachments: [
                  {
                    id: "a1",
                    hash: "f".repeat(64),
                    mimeType: "image/png",
                    width: 10,
                    height: 10,
                    byteLength: 1,
                  },
                ],
              },
            }
          : play,
      ),
      missingPlayIds: [revision.plays[1]!.playId],
      plays2: undefined,
    };
    const partial = await planReadiness(
      {
        ...withImage,
        plays: withImage.plays.filter((_, i) => i !== 1),
      } as typeof revision,
      () => Promise.resolve(false),
    );
    expect(partial.ready).toBe(false);
    expect(partial.missingImages).toEqual(["f".repeat(64)]);
    expect(partial.missingPlays.length).toBeGreaterThan(0);
  });
});
