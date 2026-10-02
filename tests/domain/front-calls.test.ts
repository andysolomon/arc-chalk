import {
  frontCallOf,
  frontJobOf,
  frontJobsOf,
  highSchoolFieldProfile,
  playDocumentSchema,
  type PlayDocument,
  type Player,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

/**
 * The front's call in isolation (ADR 0075, issue #189). Calling it on a 4-3
 * and a 3-4, slanting, twisting, keeping an end's own call and undoing are
 * `tests/e2e/front-calls.spec.ts`. These are the ways it could go wrong where
 * that journey would not notice, because it never opens a Play another
 * version saved and only ever lines up the catalogue's four- and three-man
 * fronts:
 *
 * - a Play whose front call a newer Chalk named fails to load, or loads with
 *   its men given nothing, instead of the front's own contain and rush;
 * - on a side with three men on the front, Twist pairs the inside two, or
 *   all three, instead of the end and the tackle beside him;
 * - a nose shaded a little off the ball is paired into a twist as a tackle.
 */

const man = (id: string, label: string, lateralYards: number): Player => ({
  id,
  unit: "defense",
  position: { lateralYards, depthYards: 1 },
  symbol: "triangle",
  label,
  sublabel: "",
  fill: "none",
  color: "ink",
});

const play = (
  players: readonly Player[],
  extra: Record<string, unknown> = {},
): PlayDocument =>
  playDocumentSchema.parse({
    schemaVersion: 3,
    id: "play_front_calls",
    playbookId: "playbook_front_calls",
    name: "Under test",
    unit: "defense",
    tags: [],
    notes: "",
    fieldProfile: highSchoolFieldProfile,
    players,
    assignments: [],
    paths: [],
    labels: [],
    ...extra,
  });

// A four-man front centred on the ball: end, tackle, tackle, end.
const fourMan = [
  man("le", "E", -6),
  man("lt", "T", -2.5),
  man("rt", "T", 2.5),
  man("re", "E", 6),
];

describe("the front's call", () => {
  it("loads a Play whose front call a newer Chalk named, and leaves its front on contain and rush", () => {
    const newer = play(fourMan, { unitCalls: { front: "stunt-9-tech" } });
    expect(newer.unitCalls?.front).toBe("stunt-9-tech");
    expect(frontCallOf(newer)).toBeUndefined();
    expect(frontJobOf(newer, "le")).toBe("contain");
    expect(frontJobOf(newer, "lt")).toBe("rush");
  });

  it("twists the end with the tackle beside him on a side with three men on it, and rushes the man inside them", () => {
    // Five on the front: three to the right of the ball.
    const front = [
      man("le", "E", -5),
      man("lt", "T", -1.5),
      man("rg", "T", 1.5),
      man("rt", "T", 4),
      man("re", "E", 7),
    ];
    const jobs = frontJobsOf(play(front), "twist");
    expect(jobs.get("re")).toBe("tetwist");
    expect(jobs.get("rt")).toBe("tetwist");
    expect(jobs.get("rg")).toBe("rush");
    expect(jobs.get("le")).toBe("tetwist");
    expect(jobs.get("lt")).toBe("tetwist");
  });

  it("rushes a nose shaded off the ball rather than twisting him as a tackle", () => {
    const front = [
      man("le", "E", -4.5),
      man("n", "N", 0.6),
      man("re", "E", 4.5),
    ];
    const jobs = frontJobsOf(play(front), "twist");
    expect(jobs.get("n")).toBe("rush");
    expect(jobs.get("le")).toBe("rush");
    expect(jobs.get("re")).toBe("rush");
  });
});
