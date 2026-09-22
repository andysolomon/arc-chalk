import * as z from "zod/mini";

import { createStableId } from "./canonical";
import {
  entityIdSchema,
  nameSchema,
  playDocumentSchema,
  playUnitSchema,
  type PlayDocument,
  type PlayUnit,
} from "./schema";

/**
 * A Game Plan is a curated view of the Coach's library for one game and one
 * coordinator: which Plays he will call, the sections he calls them from,
 * and the number each one answers to. It references Plays; it never copies
 * their editable source, so a Play can sit in three situations and still be
 * one Play. Preparing the plan freezes a revision — every referenced diagram,
 * as it stood — and that revision is what the printed packet and the game-day
 * reader consume. Editing the library afterwards flags the plan as behind the
 * revision; it never rewrites a packet already in a coach's pocket.
 */
export const gamePlanCallSchema = z.object({
  id: entityIdSchema,
  /** The exact Play — a variation is its own Play, so the reference is explicit. */
  playId: entityIdSchema,
  /** The call number or code. Empty until the Coach assigns one; unique once he does. */
  code: z.string(),
  note: z.optional(z.string()),
});

export const gamePlanSectionSchema = z.object({
  id: entityIdSchema,
  name: nameSchema,
  /** A call can appear in several sections; it stays one call with one code. */
  callIds: z.array(entityIdSchema),
});

/**
 * How the plan was gathered. A fixed selection is what the Coach picked and
 * nothing more; a saved filter remembers the search that found the Plays so
 * he can expand it later on purpose, never automatically.
 */
export const gamePlanFilterSchema = z.object({
  text: z.string(),
  unit: z.optional(playUnitSchema),
  playTypeId: z.optional(entityIdSchema),
  conceptId: z.optional(entityIdSchema),
  tags: z.optional(z.array(z.string())),
});

const gamePlanStructureSchema = z.object({
  schemaVersion: z.literal(1),
  id: entityIdSchema,
  playbookId: entityIdSchema,
  name: nameSchema,
  /** The coordinator this plan belongs to. */
  unit: playUnitSchema,
  opponent: z.optional(z.string()),
  /** Free text — "Week 3", "Homecoming", a date the Coach writes. */
  gameLabel: z.optional(z.string()),
  calls: z.array(gamePlanCallSchema),
  sections: z.array(gamePlanSectionSchema),
  savedFilter: z.optional(gamePlanFilterSchema),
  /** The revision the last Prepare for game produced, if any. */
  preparedRevisionId: z.optional(entityIdSchema),
  createdAtMs: z.number().check(z.int(), z.nonnegative()),
  updatedAtMs: z.number().check(z.int(), z.nonnegative()),
});

function addIssue(
  payload: {
    addIssue(issue: {
      code: "custom";
      path: PropertyKey[];
      message: string;
    }): void;
  },
  path: PropertyKey[],
  message: string,
): void {
  payload.addIssue({ code: "custom", path, message });
}

export const gamePlanSchema = gamePlanStructureSchema.check(
  z.superRefine((plan, payload) => {
    const callIds = new Set<string>();
    const codes = new Map<string, string>();
    for (const [index, call] of plan.calls.entries()) {
      if (callIds.has(call.id)) {
        addIssue(payload, ["calls", index, "id"], `Duplicate call: ${call.id}`);
      }
      callIds.add(call.id);
      const code = normalizeCallCode(call.code);
      if (code) {
        const other = codes.get(code);
        if (other) {
          addIssue(
            payload,
            ["calls", index, "code"],
            `Call code ${call.code} is already used by ${other}`,
          );
        } else {
          codes.set(code, call.id);
        }
      }
    }
    const sectionIds = new Set<string>();
    for (const [index, section] of plan.sections.entries()) {
      if (sectionIds.has(section.id)) {
        addIssue(
          payload,
          ["sections", index, "id"],
          `Duplicate section: ${section.id}`,
        );
      }
      sectionIds.add(section.id);
      const seen = new Set<string>();
      for (const [callIndex, callId] of section.callIds.entries()) {
        if (!callIds.has(callId)) {
          addIssue(
            payload,
            ["sections", index, "callIds", callIndex],
            `Section references a call the plan does not hold: ${callId}`,
          );
        }
        if (seen.has(callId)) {
          addIssue(
            payload,
            ["sections", index, "callIds", callIndex],
            `Call appears twice in one section: ${callId}`,
          );
        }
        seen.add(callId);
      }
    }
    if (plan.updatedAtMs < plan.createdAtMs) {
      addIssue(
        payload,
        ["updatedAtMs"],
        "Game Plan updatedAtMs cannot precede createdAtMs.",
      );
    }
  }),
);

/** A referenced Play, frozen with the hash it was frozen at. */
export const gamePlanRevisionPlaySchema = z.object({
  playId: entityIdSchema,
  documentHash: z.string(),
  document: playDocumentSchema,
  /** Set when the source was gone and an earlier revision's copy stood in. */
  carriedFromRevisionId: z.optional(entityIdSchema),
});

const gamePlanRevisionStructureSchema = z.object({
  schemaVersion: z.literal(1),
  id: entityIdSchema,
  planId: entityIdSchema,
  playbookId: entityIdSchema,
  createdAtMs: z.number().check(z.int(), z.nonnegative()),
  label: z.optional(z.string()),
  plan: gamePlanSchema,
  plays: z.array(gamePlanRevisionPlaySchema),
  /** Calls whose Play could not be found anywhere; they still print, flagged. */
  missingPlayIds: z.array(entityIdSchema),
});

export const gamePlanRevisionSchema = gamePlanRevisionStructureSchema.check(
  z.superRefine((revision, payload) => {
    if (revision.plan.id !== revision.planId) {
      addIssue(
        payload,
        ["planId"],
        `Revision plan does not match its snapshot: ${revision.plan.id}`,
      );
    }
    const frozen = new Set(revision.plays.map(({ playId }) => playId));
    const missing = new Set(revision.missingPlayIds);
    for (const [index, call] of revision.plan.calls.entries()) {
      if (!frozen.has(call.playId) && !missing.has(call.playId)) {
        addIssue(
          payload,
          ["plan", "calls", index, "playId"],
          `Revision omits a call's Play: ${call.playId}`,
        );
      }
    }
  }),
);

export type GamePlanCall = z.infer<typeof gamePlanCallSchema>;
export type GamePlanSection = z.infer<typeof gamePlanSectionSchema>;
export type GamePlanFilter = z.infer<typeof gamePlanFilterSchema>;
export type GamePlan = z.infer<typeof gamePlanSchema>;
export type GamePlanRevisionPlay = z.infer<typeof gamePlanRevisionPlaySchema>;
export type GamePlanRevision = z.infer<typeof gamePlanRevisionSchema>;

/** Metadata for one prepared revision, without its frozen Plays. */
export interface GamePlanRevisionSummary {
  readonly id: string;
  readonly planId: string;
  readonly createdAtMs: number;
  readonly label?: string;
  readonly callCount: number;
  readonly missingCount: number;
}

export function gamePlanRevisionSummary(
  revision: GamePlanRevision,
): GamePlanRevisionSummary {
  return {
    id: revision.id,
    planId: revision.planId,
    createdAtMs: revision.createdAtMs,
    ...(revision.label === undefined ? {} : { label: revision.label }),
    callCount: revision.plan.calls.length,
    missingCount: revision.missingPlayIds.length,
  };
}

export class GamePlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GamePlanError";
  }
}

export type CreateId = (prefix: string) => string;

/** Codes compare without case or surrounding space: `12` and ` 12 ` collide. */
export function normalizeCallCode(code: string): string {
  return code.trim().replace(/\s+/g, " ").toUpperCase();
}

const touch = (plan: GamePlan, nowMs: number): GamePlan => ({
  ...plan,
  updatedAtMs: Math.max(nowMs, plan.createdAtMs),
});

export function createGamePlan(input: {
  readonly playbookId: string;
  readonly name: string;
  readonly unit: PlayUnit;
  readonly nowMs: number;
  readonly id?: string;
  readonly opponent?: string;
  readonly gameLabel?: string;
  readonly sections?: readonly string[];
  readonly createId?: CreateId;
}): GamePlan {
  const createId = input.createId ?? createStableId;
  const name = input.name.trim();
  if (!name) throw new GamePlanError("Give the game plan a name first.");
  return gamePlanSchema.parse({
    schemaVersion: 1,
    id: input.id ?? createId("game_plan"),
    playbookId: input.playbookId,
    name,
    unit: input.unit,
    ...(input.opponent?.trim() ? { opponent: input.opponent.trim() } : {}),
    ...(input.gameLabel?.trim() ? { gameLabel: input.gameLabel.trim() } : {}),
    calls: [],
    sections: (input.sections ?? []).map((sectionName) => ({
      id: createId("plan_section"),
      name: sectionName,
      callIds: [],
    })),
    createdAtMs: input.nowMs,
    updatedAtMs: input.nowMs,
  });
}

/** The sections a fresh plan starts with, in the order coordinators call them. */
export const defaultGamePlanSections: Readonly<
  Record<PlayUnit, readonly string[]>
> = Object.freeze({
  offense: ["Openers", "1st & 10", "3rd down", "Red zone", "Two minute"],
  defense: ["Base", "3rd down", "Red zone", "Pressure", "Two minute"],
});

export function renameGamePlan(
  plan: GamePlan,
  name: string,
  nowMs: number,
): GamePlan {
  const trimmed = name.trim();
  if (!trimmed) throw new GamePlanError("A game plan needs a name.");
  if (trimmed === plan.name) return plan;
  return touch({ ...plan, name: trimmed }, nowMs);
}

export function setGamePlanDetails(
  plan: GamePlan,
  details: { readonly opponent?: string; readonly gameLabel?: string },
  nowMs: number,
): GamePlan {
  const next = { ...plan };
  for (const key of ["opponent", "gameLabel"] as const) {
    const value = details[key]?.trim();
    if (details[key] === undefined) continue;
    if (value) next[key] = value;
    else delete next[key];
  }
  return touch(next, nowMs);
}

/**
 * Last week's plan again, with fresh identities for the plan, its sections
 * and its calls — codes and section order come along, the prepared revision
 * does not, because nothing about the copy has been prepared yet.
 */
export function duplicateGamePlan(
  plan: GamePlan,
  input: {
    readonly name: string;
    readonly nowMs: number;
    readonly id?: string;
    readonly opponent?: string;
    readonly gameLabel?: string;
    readonly createId?: CreateId;
  },
): GamePlan {
  const createId = input.createId ?? createStableId;
  const name = input.name.trim();
  if (!name) throw new GamePlanError("Give the copy a name first.");
  const callIdMap = new Map(
    plan.calls.map((call) => [call.id, createId("plan_call")]),
  );
  const copy: GamePlan = {
    ...plan,
    id: input.id ?? createId("game_plan"),
    name,
    calls: plan.calls.map((call) => ({ ...call, id: callIdMap.get(call.id)! })),
    sections: plan.sections.map((section) => ({
      ...section,
      id: createId("plan_section"),
      callIds: section.callIds.map((callId) => callIdMap.get(callId)!),
    })),
    createdAtMs: input.nowMs,
    updatedAtMs: input.nowMs,
  };
  delete copy.preparedRevisionId;
  return gamePlanSchema.parse(
    setGamePlanDetails(
      copy,
      {
        ...(input.opponent === undefined ? {} : { opponent: input.opponent }),
        ...(input.gameLabel === undefined
          ? {}
          : { gameLabel: input.gameLabel }),
      },
      input.nowMs,
    ),
  );
}

export interface AdditionPreview {
  /** Plays that are not yet in the plan and would become new calls. */
  readonly added: number;
  /** Plays already in the plan; with a section given, they are placed there. */
  readonly already: number;
  readonly total: number;
}

/** What a bulk addition would do, said before it is done. */
export function previewAddition(
  plan: GamePlan,
  playIds: readonly string[],
): AdditionPreview {
  const unique = [...new Set(playIds)];
  const held = new Set(plan.calls.map(({ playId }) => playId));
  const already = unique.filter((playId) => held.has(playId)).length;
  return { added: unique.length - already, already, total: unique.length };
}

export function describeAddition(
  preview: AdditionPreview,
  sectionName?: string,
): string {
  if (preview.total === 0) return "Nothing selected.";
  const parts = [];
  if (preview.added > 0) {
    parts.push(
      `${preview.added} new ${preview.added === 1 ? "call" : "calls"}`,
    );
  }
  if (preview.already > 0) {
    parts.push(
      `${preview.already} already in the plan${sectionName ? `, placed in ${sectionName}` : ""}`,
    );
  }
  return parts.join(" · ");
}

export interface AdditionResult {
  readonly plan: GamePlan;
  readonly callIds: readonly string[];
  readonly preview: AdditionPreview;
}

/**
 * Adds Plays as calls. A Play already in the plan is not duplicated — it
 * keeps its one call and one code — but with a section named it is placed
 * there too, which is how one call comes to answer in several situations.
 */
export function addCalls(
  plan: GamePlan,
  playIds: readonly string[],
  input: {
    readonly nowMs: number;
    readonly sectionId?: string;
    readonly createId?: CreateId;
  },
): AdditionResult {
  const createId = input.createId ?? createStableId;
  const preview = previewAddition(plan, playIds);
  const byPlay = new Map(plan.calls.map((call) => [call.playId, call]));
  const calls = [...plan.calls];
  const callIds: string[] = [];
  for (const playId of new Set(playIds)) {
    const existing = byPlay.get(playId);
    if (existing) {
      callIds.push(existing.id);
      continue;
    }
    const call: GamePlanCall = { id: createId("plan_call"), playId, code: "" };
    calls.push(call);
    byPlay.set(playId, call);
    callIds.push(call.id);
  }
  let next: GamePlan = { ...plan, calls };
  if (input.sectionId !== undefined) {
    for (const callId of callIds) {
      next = placeCallInSection(
        next,
        callId,
        input.sectionId,
        undefined,
        input.nowMs,
      );
    }
  }
  return {
    plan: gamePlanSchema.parse(touch(next, input.nowMs)),
    callIds,
    preview,
  };
}

/** Removes a call from the plan and from every section that lists it. */
export function removeCall(
  plan: GamePlan,
  callId: string,
  nowMs: number,
): GamePlan {
  if (!plan.calls.some(({ id }) => id === callId)) return plan;
  return touch(
    {
      ...plan,
      calls: plan.calls.filter(({ id }) => id !== callId),
      sections: plan.sections.map((section) => ({
        ...section,
        callIds: section.callIds.filter((id) => id !== callId),
      })),
    },
    nowMs,
  );
}

export type CodeAssignment =
  | { readonly ok: true; readonly plan: GamePlan }
  | {
      readonly ok: false;
      readonly reason: string;
      /** The call already holding that code. */
      readonly holderCallId: string;
    };

/**
 * Gives a call its number. A code is unique within the plan; a collision is
 * reported with who holds it and nothing is renumbered on the Coach's behalf.
 * An empty code takes the number off.
 */
export function assignCallCode(
  plan: GamePlan,
  callId: string,
  code: string,
  nowMs: number,
): CodeAssignment {
  const call = plan.calls.find(({ id }) => id === callId);
  if (!call) throw new GamePlanError(`No such call: ${callId}`);
  const normalized = normalizeCallCode(code);
  if (normalized) {
    const holder = plan.calls.find(
      (other) =>
        other.id !== callId && normalizeCallCode(other.code) === normalized,
    );
    if (holder) {
      return {
        ok: false,
        reason: `${code.trim()} is already a call in this plan.`,
        holderCallId: holder.id,
      };
    }
  }
  const trimmed = code.trim();
  if (trimmed === call.code) return { ok: true, plan };
  return {
    ok: true,
    plan: touch(
      {
        ...plan,
        calls: plan.calls.map((other) =>
          other.id === callId ? { ...other, code: trimmed } : other,
        ),
      },
      nowMs,
    ),
  };
}

export function setCallNote(
  plan: GamePlan,
  callId: string,
  note: string,
  nowMs: number,
): GamePlan {
  const trimmed = note.trim();
  return touch(
    {
      ...plan,
      calls: plan.calls.map((call) => {
        if (call.id !== callId) return call;
        const next = { ...call };
        if (trimmed) next.note = trimmed;
        else delete next.note;
        return next;
      }),
    },
    nowMs,
  );
}

/** The next free number, counting up from the highest numeric code in use. */
export function nextFreeCallCode(plan: GamePlan): string {
  let highest = 0;
  for (const call of plan.calls) {
    const value = Number(call.code.trim());
    if (Number.isInteger(value) && value > highest) highest = value;
  }
  return String(highest + 1);
}

export function addSection(
  plan: GamePlan,
  input: {
    readonly name: string;
    readonly nowMs: number;
    readonly id?: string;
    readonly createId?: CreateId;
  },
): GamePlan {
  const name = input.name.trim();
  if (!name) throw new GamePlanError("A section needs a name.");
  return touch(
    {
      ...plan,
      sections: [
        ...plan.sections,
        {
          id: input.id ?? (input.createId ?? createStableId)("plan_section"),
          name,
          callIds: [],
        },
      ],
    },
    input.nowMs,
  );
}

export function renameSection(
  plan: GamePlan,
  sectionId: string,
  name: string,
  nowMs: number,
): GamePlan {
  const trimmed = name.trim();
  if (!trimmed) throw new GamePlanError("A section needs a name.");
  return touch(
    {
      ...plan,
      sections: plan.sections.map((section) =>
        section.id === sectionId ? { ...section, name: trimmed } : section,
      ),
    },
    nowMs,
  );
}

/**
 * Takes a section away. Its calls stay in the plan — a call is never lost
 * because its heading was — and turn up under Unsectioned until placed.
 */
export function removeSection(
  plan: GamePlan,
  sectionId: string,
  nowMs: number,
): GamePlan {
  if (!plan.sections.some(({ id }) => id === sectionId)) return plan;
  return touch(
    {
      ...plan,
      sections: plan.sections.filter(({ id }) => id !== sectionId),
    },
    nowMs,
  );
}

function moveWithin<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export function moveSection(
  plan: GamePlan,
  sectionId: string,
  to: number | "up" | "down",
  nowMs: number,
): GamePlan {
  const from = plan.sections.findIndex(({ id }) => id === sectionId);
  if (from < 0) return plan;
  const target =
    to === "up" ? from - 1 : to === "down" ? from + 1 : Math.trunc(to);
  if (target < 0 || target >= plan.sections.length || target === from) {
    return plan;
  }
  return touch(
    { ...plan, sections: moveWithin(plan.sections, from, target) },
    nowMs,
  );
}

/**
 * Places a call in a section, at the end unless an index is given. A call
 * already in that section moves to the index rather than appearing twice.
 */
export function placeCallInSection(
  plan: GamePlan,
  callId: string,
  sectionId: string,
  index: number | undefined,
  nowMs: number,
): GamePlan {
  if (!plan.calls.some(({ id }) => id === callId)) {
    throw new GamePlanError(`No such call: ${callId}`);
  }
  const section = plan.sections.find(({ id }) => id === sectionId);
  if (!section) throw new GamePlanError(`No such section: ${sectionId}`);
  const without = section.callIds.filter((id) => id !== callId);
  const at =
    index === undefined
      ? without.length
      : Math.max(0, Math.min(without.length, Math.trunc(index)));
  const callIds = [...without.slice(0, at), callId, ...without.slice(at)];
  if (callIds.join(" ") === section.callIds.join(" ")) return plan;
  return touch(
    {
      ...plan,
      sections: plan.sections.map((other) =>
        other.id === sectionId ? { ...other, callIds } : other,
      ),
    },
    nowMs,
  );
}

export function removeCallFromSection(
  plan: GamePlan,
  callId: string,
  sectionId: string,
  nowMs: number,
): GamePlan {
  const section = plan.sections.find(({ id }) => id === sectionId);
  if (!section || !section.callIds.includes(callId)) return plan;
  return touch(
    {
      ...plan,
      sections: plan.sections.map((other) =>
        other.id === sectionId
          ? { ...other, callIds: other.callIds.filter((id) => id !== callId) }
          : other,
      ),
    },
    nowMs,
  );
}

export function moveCallInSection(
  plan: GamePlan,
  sectionId: string,
  callId: string,
  to: number | "up" | "down",
  nowMs: number,
): GamePlan {
  const section = plan.sections.find(({ id }) => id === sectionId);
  if (!section) return plan;
  const from = section.callIds.indexOf(callId);
  if (from < 0) return plan;
  const target =
    to === "up" ? from - 1 : to === "down" ? from + 1 : Math.trunc(to);
  if (target < 0 || target >= section.callIds.length || target === from) {
    return plan;
  }
  return touch(
    {
      ...plan,
      sections: plan.sections.map((other) =>
        other.id === sectionId
          ? { ...other, callIds: moveWithin(other.callIds, from, target) }
          : other,
      ),
    },
    nowMs,
  );
}

/** Moves a call from one section to another, keeping its code as it is. */
export function moveCallToSection(
  plan: GamePlan,
  callId: string,
  fromSectionId: string,
  toSectionId: string,
  nowMs: number,
): GamePlan {
  if (fromSectionId === toSectionId) return plan;
  const placed = placeCallInSection(
    plan,
    callId,
    toSectionId,
    undefined,
    nowMs,
  );
  return removeCallFromSection(placed, callId, fromSectionId, nowMs);
}

/** Codes sort numerically when they are numbers, else as words; never renumbered. */
export function compareCallCodes(left: string, right: string): number {
  const l = left.trim();
  const r = right.trim();
  if (l === "" && r === "") return 0;
  if (l === "") return 1;
  if (r === "") return -1;
  const ln = Number(l);
  const rn = Number(r);
  const lNumeric = l !== "" && Number.isFinite(ln);
  const rNumeric = r !== "" && Number.isFinite(rn);
  if (lNumeric && rNumeric) return ln - rn;
  if (lNumeric) return -1;
  if (rNumeric) return 1;
  return l.localeCompare(r, undefined, { numeric: true, sensitivity: "base" });
}

/** Orders a section by code without touching any code. */
export function sortSectionByCode(
  plan: GamePlan,
  sectionId: string,
  nowMs: number,
): GamePlan {
  const section = plan.sections.find(({ id }) => id === sectionId);
  if (!section) return plan;
  const codeOf = new Map(plan.calls.map((call) => [call.id, call.code]));
  const callIds = [...section.callIds].sort((a, b) =>
    compareCallCodes(codeOf.get(a) ?? "", codeOf.get(b) ?? ""),
  );
  if (callIds.join(" ") === section.callIds.join(" ")) return plan;
  return touch(
    {
      ...plan,
      sections: plan.sections.map((other) =>
        other.id === sectionId ? { ...other, callIds } : other,
      ),
    },
    nowMs,
  );
}

/** Calls no section lists, in plan order. They are still calls. */
export function unsectionedCallIds(plan: GamePlan): readonly string[] {
  const placed = new Set(plan.sections.flatMap(({ callIds }) => callIds));
  return plan.calls.flatMap(({ id }) => (placed.has(id) ? [] : [id]));
}

/** The name of the section a call would go to, said before a bulk addition. */
export function sectionName(
  plan: GamePlan,
  sectionId: string | undefined,
): string | undefined {
  return plan.sections.find(({ id }) => id === sectionId)?.name;
}

export interface PlaySource {
  readonly document: PlayDocument;
  readonly documentHash: string;
}

export interface PrepareResult {
  readonly revision: GamePlanRevision;
  /** The plan pointing at the new revision. */
  readonly plan: GamePlan;
  readonly missingPlayIds: readonly string[];
  readonly carriedPlayIds: readonly string[];
}

/**
 * Prepare for game: freezes every referenced Play as it stands now into one
 * revision the packet and the reader both read. A Play that has since been
 * deleted is not dropped — the previous revision's copy stands in when there
 * is one, and the call is listed as missing when there is not — so a call
 * sheet never quietly loses a number.
 */
export function prepareGamePlan(
  plan: GamePlan,
  sources: ReadonlyMap<string, PlaySource | undefined>,
  input: {
    readonly nowMs: number;
    readonly id?: string;
    readonly label?: string;
    readonly previous?: GamePlanRevision;
    readonly createId?: CreateId;
  },
): PrepareResult {
  const id = input.id ?? (input.createId ?? createStableId)("plan_revision");
  const previousById = new Map(
    (input.previous?.plays ?? []).map((frozen) => [frozen.playId, frozen]),
  );
  const plays: GamePlanRevisionPlay[] = [];
  const missingPlayIds: string[] = [];
  const carriedPlayIds: string[] = [];
  for (const playId of new Set(plan.calls.map(({ playId }) => playId))) {
    const source = sources.get(playId);
    if (source) {
      plays.push({
        playId,
        documentHash: source.documentHash,
        document: source.document,
      });
      continue;
    }
    const carried = previousById.get(playId);
    if (carried && input.previous) {
      plays.push({
        playId,
        documentHash: carried.documentHash,
        document: carried.document,
        carriedFromRevisionId:
          carried.carriedFromRevisionId ?? input.previous.id,
      });
      carriedPlayIds.push(playId);
      continue;
    }
    missingPlayIds.push(playId);
  }
  const prepared: GamePlan = touch(
    { ...plan, preparedRevisionId: id },
    input.nowMs,
  );
  const revision = gamePlanRevisionSchema.parse({
    schemaVersion: 1,
    id,
    planId: plan.id,
    playbookId: plan.playbookId,
    createdAtMs: input.nowMs,
    ...(input.label?.trim() ? { label: input.label.trim() } : {}),
    plan: prepared,
    plays,
    missingPlayIds,
  });
  return { revision, plan: prepared, missingPlayIds, carriedPlayIds };
}

export interface RevisionStatus {
  /** Nothing has been prepared yet. */
  readonly prepared: boolean;
  /** The plan or its Plays moved on since the revision was made. */
  readonly stale: boolean;
  /** Plays whose source changed since it was frozen. */
  readonly changedPlayIds: readonly string[];
  /** Plays whose source is gone now. */
  readonly missingPlayIds: readonly string[];
  /** The plan's calls, sections or codes differ from the frozen ones. */
  readonly planChanged: boolean;
}

/** What is frozen in the revision, compared against what the plan sees now. */
function planShape(plan: GamePlan): string {
  return JSON.stringify({
    name: plan.name,
    unit: plan.unit,
    opponent: plan.opponent ?? "",
    gameLabel: plan.gameLabel ?? "",
    calls: plan.calls.map((call) => [
      call.id,
      call.playId,
      call.code,
      call.note ?? "",
    ]),
    sections: plan.sections.map((section) => [
      section.id,
      section.name,
      section.callIds,
    ]),
  });
}

/**
 * Whether the packet in a coach's hand still matches the library. A newer
 * source is flagged, never applied: the Coach prepares again when he means
 * to hand out a new one.
 */
export function revisionStatus(
  plan: GamePlan,
  revision: GamePlanRevision | undefined,
  currentHashes: ReadonlyMap<string, string | undefined>,
): RevisionStatus {
  if (!revision || plan.preparedRevisionId !== revision.id) {
    return {
      prepared: false,
      stale: false,
      changedPlayIds: [],
      missingPlayIds: [],
      planChanged: false,
    };
  }
  const frozen = new Map(
    revision.plays.map((entry) => [entry.playId, entry.documentHash]),
  );
  const changedPlayIds: string[] = [];
  const missingPlayIds: string[] = [];
  for (const playId of new Set(plan.calls.map(({ playId }) => playId))) {
    const current = currentHashes.get(playId);
    if (current === undefined) {
      missingPlayIds.push(playId);
      continue;
    }
    const was = frozen.get(playId);
    if (was !== undefined && was !== current) changedPlayIds.push(playId);
  }
  const planChanged = planShape(plan) !== planShape(revision.plan);
  return {
    prepared: true,
    stale:
      planChanged || changedPlayIds.length > 0 || missingPlayIds.length > 0,
    changedPlayIds,
    missingPlayIds,
    planChanged,
  };
}

export interface CallRow {
  readonly callId: string;
  readonly code: string;
  readonly playId: string;
  readonly name: string;
  readonly play?: PlayDocument;
  readonly note?: string;
  readonly missing: boolean;
}

export interface SectionRows {
  readonly sectionId?: string;
  readonly name: string;
  readonly calls: readonly CallRow[];
}

export const UNSECTIONED_NAME = "Unsectioned";

/**
 * The plan laid out the way a sheet reads it: each section in order with its
 * calls in order, then whatever no section claims. Every call appears; a
 * missing Play is named as missing rather than left off.
 */
export function revisionRows(
  revision: GamePlanRevision,
): readonly SectionRows[] {
  const frozen = new Map(
    revision.plays.map((entry) => [entry.playId, entry.document]),
  );
  return planRows(revision.plan, (playId) => frozen.get(playId));
}

export function planRows(
  plan: GamePlan,
  playFor: (playId: string) => PlayDocument | undefined,
  nameFor: (playId: string) => string | undefined = (playId) =>
    playFor(playId)?.name,
): readonly SectionRows[] {
  const callById = new Map(plan.calls.map((call) => [call.id, call]));
  const row = (callId: string): CallRow | undefined => {
    const call = callById.get(callId);
    if (!call) return undefined;
    const play = playFor(call.playId);
    const name = nameFor(call.playId) ?? play?.name;
    return {
      callId: call.id,
      code: call.code,
      playId: call.playId,
      name: name ?? "Missing play",
      ...(play === undefined ? {} : { play }),
      ...(call.note === undefined ? {} : { note: call.note }),
      missing: play === undefined && name === undefined,
    };
  };
  const rows = (callIds: readonly string[]): CallRow[] =>
    callIds.flatMap((callId) => {
      const value = row(callId);
      return value ? [value] : [];
    });
  const sections: SectionRows[] = plan.sections.map((section) => ({
    sectionId: section.id,
    name: section.name,
    calls: rows(section.callIds),
  }));
  const loose = rows(unsectionedCallIds(plan));
  if (loose.length > 0) sections.push({ name: UNSECTIONED_NAME, calls: loose });
  return sections;
}

/** The Plays in a plan, once each, in first-appearance order. */
export function planPlayIds(plan: GamePlan): readonly string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const section of plan.sections) {
    for (const callId of section.callIds) {
      const call = plan.calls.find(({ id }) => id === callId);
      if (call && !seen.has(call.playId)) {
        seen.add(call.playId);
        ordered.push(call.playId);
      }
    }
  }
  for (const call of plan.calls) {
    if (!seen.has(call.playId)) {
      seen.add(call.playId);
      ordered.push(call.playId);
    }
  }
  return ordered;
}

/** `Week 3 · vs Central`, or whichever half the Coach wrote. */
export function gamePlanSubtitle(
  plan: Pick<GamePlan, "gameLabel" | "opponent">,
): string {
  return [plan.gameLabel, plan.opponent ? `vs ${plan.opponent}` : undefined]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}
