import { stockDefensiveCalls } from "./defense-catalogue";
import { stockFormations } from "./formation-catalogue";
import type { GamePlan } from "./game-plan";
import {
  playDocumentSchema,
  type Concept,
  type Formation,
  type FormationSlotBinding,
  type PlayDocument,
  type PlayTypeDefinition,
  type Playbook,
  type PlaybookEnvelope,
} from "./schema";

/**
 * Organizing a real library (issue #166): a Coach copies and moves Plays
 * between books, duplicates a book to split it into packages, and puts a
 * book's Plays in the order his staff installs them. Everything here is pure;
 * the runtime writes what it returns.
 */

/** Names are compared the way a Coach reads them: case and spacing aside. */
export function playbookNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** A book's name with its spaces trimmed and collapsed, as it is saved. */
export function tidyPlaybookName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * The name a duplicate is saved under: "Base Offense copy", then "copy 2"
 * and on, so it never takes a name another book on the device answers to.
 */
export function copyNameFor(name: string, taken: readonly string[]): string {
  const keys = new Set(taken.map(playbookNameKey));
  const base = `${tidyPlaybookName(name)} copy`;
  if (!keys.has(playbookNameKey(base))) return base;
  for (let count = 2; ; count += 1) {
    const next = `${base} ${count}`;
    if (!keys.has(playbookNameKey(next))) return next;
  }
}

/**
 * The Plays of a book in its install order: the ones the Coach placed, in
 * the order he placed them, then any he has not yet placed, in the order
 * they came in.
 */
export function inInstallOrder<T extends { readonly playId: string }>(
  plays: readonly T[],
  playOrder: readonly string[] | undefined,
): readonly T[] {
  if (!playOrder || playOrder.length === 0) return plays;
  const rank = new Map(playOrder.map((id, index) => [id, index]));
  const placed = plays
    .filter(({ playId }) => rank.has(playId))
    .sort((left, right) => rank.get(left.playId)! - rank.get(right.playId)!);
  return [...placed, ...plays.filter(({ playId }) => !rank.has(playId))];
}

/**
 * The install order after one Play is dropped beside another. `order` is
 * the whole book as it reads now; the answer lists every one of its Plays.
 */
export function movePlayInOrder(
  order: readonly string[],
  playId: string,
  targetId: string,
  place: "before" | "after",
): readonly string[] {
  if (playId === targetId || !order.includes(targetId)) return order;
  const rest = order.filter((id) => id !== playId);
  const at = rest.indexOf(targetId) + (place === "after" ? 1 : 0);
  return [...rest.slice(0, at), playId, ...rest.slice(at)];
}

/** What a Play draws on from the book it sits in. */
export interface BookContents {
  readonly playbook: Playbook;
  readonly concepts: readonly Concept[];
  readonly formations: readonly Formation[];
}

/** A Play put into another book, and what that book needs to hold it. */
export interface PlayTransfer {
  readonly play: PlayDocument;
  /** The target book with the Play Type the copy brought, when it had none. */
  readonly playbook?: Playbook;
  /** Concepts and saved sets the target did not have, to write beside it. */
  readonly concepts: readonly Concept[];
  readonly formations: readonly Formation[];
}

const isShipped = (id: string) =>
  stockFormations.some((formation) => formation.id === id) ||
  stockDefensiveCalls.some(({ formation }) => formation.id === id);

/**
 * A copy of a Play in another book that keeps what it was linked to: the
 * same Type, its Concept, and the saved set or front it stands in. Shipped
 * sets and calls belong to every book, so their links stay as they are. A
 * Concept or saved set the target already has under the same name is used;
 * otherwise it is copied in with the Play.
 */
export function copyPlayInto(input: {
  readonly play: PlayDocument;
  readonly from: BookContents;
  readonly to: BookContents;
  readonly id: string;
  readonly createId: (prefix: string) => string;
}): PlayTransfer {
  const { play, from, to, createId } = input;
  const concepts: Concept[] = [];
  const formations: Formation[] = [];
  let playbook: Playbook | undefined;

  let playType = play.playType;
  if (playType) {
    const types = to.playbook.playTypes;
    const source = from.playbook.playTypes.find(
      ({ id }) => id === playType!.id,
    );
    const name = source?.name ?? playType.name;
    const match =
      types.find(({ id, unit }) => id === playType!.id && unit === play.unit) ??
      (source?.builtInKey
        ? types.find(
            ({ builtInKey, unit }) =>
              builtInKey === source.builtInKey && unit === play.unit,
          )
        : undefined) ??
      types.find(
        ({ name: other, unit }) =>
          unit === play.unit &&
          playbookNameKey(other) === playbookNameKey(name),
      );
    if (match) {
      playType = { id: match.id, name: match.name };
    } else {
      const added: PlayTypeDefinition = {
        id: types.some(({ id }) => id === playType!.id)
          ? createId("play_type")
          : playType.id,
        name,
        unit: play.unit,
        ...(source?.builtInKey ? { builtInKey: source.builtInKey } : {}),
        order: Math.max(-1, ...types.map(({ order }) => order)) + 1,
        archived: source?.archived ?? false,
      };
      playbook = { ...to.playbook, playTypes: [...types, added] };
      playType = { id: added.id, name: added.name };
    }
  }

  let conceptSource = play.conceptSource;
  if (conceptSource) {
    const source = from.concepts.find(
      ({ id }) => id === conceptSource!.conceptId,
    );
    const match = source
      ? to.concepts.find(
          ({ name, unit }) =>
            unit === source.unit &&
            playbookNameKey(name) === playbookNameKey(source.name),
        )
      : undefined;
    if (!source) {
      conceptSource = undefined;
    } else if (match) {
      conceptSource = {
        conceptId: match.id,
        revision: Math.min(conceptSource.revision, match.revision),
      };
    } else {
      const copied: Concept = {
        ...structuredClone(source),
        id: createId("concept"),
        playbookId: to.playbook.id,
      };
      concepts.push(copied);
      conceptSource = { ...conceptSource, conceptId: copied.id };
    }
  }

  /** The target's copy of a saved set or front, found or brought along. */
  const carry = (
    formationId: string,
    bindings: readonly FormationSlotBinding[],
  ): Formation | undefined => {
    const source = from.formations.find(({ id }) => id === formationId);
    if (!source) return undefined;
    const fits = (candidate: Formation) =>
      candidate.unit === source.unit &&
      playbookNameKey(candidate.name) === playbookNameKey(source.name) &&
      bindings.every(({ slotId }) =>
        candidate.slots.some(({ id }) => id === slotId),
      );
    const match = [...to.formations, ...formations].find(fits);
    if (match) return match;
    const copied: Formation = {
      ...structuredClone(source),
      id: createId("formation"),
      playbookId: to.playbook.id,
    };
    delete (copied as { mirrorFormationId?: string }).mirrorFormationId;
    formations.push(copied);
    return copied;
  };

  let formationSource = play.formationSource;
  if (formationSource && !isShipped(formationSource.formationId)) {
    const target = carry(
      formationSource.formationId,
      formationSource.slotBindings,
    );
    formationSource = target
      ? {
          ...formationSource,
          formationId: target.id,
          revision: Math.min(formationSource.revision, target.revision),
        }
      : undefined;
  }
  let defensiveCallSource = play.defensiveCallSource;
  if (defensiveCallSource && !isShipped(defensiveCallSource.callId)) {
    const target = carry(
      defensiveCallSource.callId,
      defensiveCallSource.slotBindings,
    );
    defensiveCallSource = target
      ? { ...defensiveCallSource, callId: target.id }
      : undefined;
  }

  const copy = structuredClone(play) as PlayDocument & Record<string, unknown>;
  delete copy.playType;
  delete copy.conceptSource;
  delete copy.formationSource;
  delete copy.defensiveCallSource;
  return {
    play: playDocumentSchema.parse({
      ...copy,
      id: input.id,
      playbookId: to.playbook.id,
      ...(playType ? { playType } : {}),
      ...(conceptSource ? { conceptSource } : {}),
      ...(formationSource ? { formationSource } : {}),
      ...(defensiveCallSource ? { defensiveCallSource } : {}),
    }),
    ...(playbook ? { playbook } : {}),
    concepts,
    formations,
  };
}

/**
 * A whole book copied under a new name: its Plays, Concepts, saved sets and
 * fronts, install order and Game plans, each under a new id and linked to
 * one another as the original's are. A plan's prepared packets stay with
 * the original; the copy is prepared again when it is used.
 */
export function duplicatePlaybook(input: {
  readonly envelope: PlaybookEnvelope;
  readonly gamePlans: readonly GamePlan[];
  readonly name: string;
  readonly createId: (prefix: string) => string;
  readonly nowMs: number;
}): {
  readonly envelope: PlaybookEnvelope;
  readonly gamePlans: readonly GamePlan[];
} {
  const { envelope, createId, nowMs } = input;
  const playbookId = createId("playbook");
  const conceptIds = new Map(
    envelope.concepts.map(({ id }) => [id, createId("concept")]),
  );
  const formationIds = new Map(
    envelope.formations.map(({ id }) => [id, createId("formation")]),
  );
  const playIds = new Map(
    envelope.plays.map(({ id }) => [id, createId("play")]),
  );
  const source = envelope.playbook as Playbook & Record<string, unknown>;
  const playbook: Playbook = {
    ...structuredClone(source),
    id: playbookId,
    name: tidyPlaybookName(input.name),
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    ...(source.playOrder
      ? {
          playOrder: source.playOrder.flatMap((id) => {
            const next = playIds.get(id);
            return next ? [next] : [];
          }),
        }
      : {}),
  };
  delete (playbook as { archivedAtMs?: number }).archivedAtMs;

  const formations = envelope.formations.map((formation): Formation => {
    const copy: Formation = {
      ...structuredClone(formation),
      id: formationIds.get(formation.id)!,
      playbookId,
    };
    const mirror = formation.mirrorFormationId
      ? formationIds.get(formation.mirrorFormationId)
      : undefined;
    if (mirror) return { ...copy, mirrorFormationId: mirror };
    delete (copy as { mirrorFormationId?: string }).mirrorFormationId;
    return copy;
  });
  const plays = envelope.plays.map((play) =>
    playDocumentSchema.parse({
      ...structuredClone(play),
      id: playIds.get(play.id)!,
      playbookId,
      ...(play.conceptSource
        ? {
            conceptSource: {
              ...play.conceptSource,
              conceptId:
                conceptIds.get(play.conceptSource.conceptId) ??
                play.conceptSource.conceptId,
            },
          }
        : {}),
      ...(play.formationSource
        ? {
            formationSource: {
              ...play.formationSource,
              formationId:
                formationIds.get(play.formationSource.formationId) ??
                play.formationSource.formationId,
            },
          }
        : {}),
      ...(play.defensiveCallSource
        ? {
            defensiveCallSource: {
              ...play.defensiveCallSource,
              callId:
                formationIds.get(play.defensiveCallSource.callId) ??
                play.defensiveCallSource.callId,
            },
          }
        : {}),
    }),
  );

  const gamePlans = input.gamePlans.map((plan): GamePlan => {
    const calls = plan.calls.flatMap((call) => {
      const playId = playIds.get(call.playId);
      return playId ? [{ ...call, playId }] : [];
    });
    const kept = new Set(calls.map(({ id }) => id));
    const copy: GamePlan = {
      ...structuredClone(plan),
      id: createId("game_plan"),
      playbookId,
      calls,
      sections: plan.sections.map((section) => ({
        ...section,
        id: createId("plan_section"),
        callIds: section.callIds.filter((id) => kept.has(id)),
      })),
      ...(plan.savedFilter?.conceptId
        ? {
            savedFilter: {
              ...plan.savedFilter,
              conceptId:
                conceptIds.get(plan.savedFilter.conceptId) ??
                plan.savedFilter.conceptId,
            },
          }
        : {}),
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };
    delete (copy as { preparedRevisionId?: string }).preparedRevisionId;
    return copy;
  });

  return {
    envelope: {
      ...envelope,
      exportedAtMs: nowMs,
      playbook,
      concepts: envelope.concepts.map((concept) => ({
        ...structuredClone(concept),
        id: conceptIds.get(concept.id)!,
        playbookId,
      })),
      formations,
      plays,
    },
    gamePlans,
  };
}
