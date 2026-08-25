import {
  attachPlayToConcept,
  conceptFromPlay,
  createStableId,
  createVariationPlay,
  detachPlayFromConcept,
  emptyPlayDocument,
  formatBroadcastReport,
  propagateCommand,
  pushAlignmentToPlay,
  recognizeFormation,
  stockFormations,
  variantNameFrom,
  type Concept,
  type LibraryEditScope,
  type PlayCommand,
  type PlayDocument,
} from "@chalk/domain";
import type { EditorStore } from "@chalk/editor";
import type { PlaySearchProjection } from "@chalk/local-db";

import type { ChalkLibrary, LibrarySnapshot } from "../app/editor-runtime";

export async function openLibraryPlay(
  library: ChalkLibrary,
  editorStore: EditorStore,
  playId: string,
): Promise<boolean> {
  if (editorStore.getSnapshot().localSave.phase === "error") return false;
  const stored = await library.getPlay(playId);
  if (!stored) return false;
  await editorStore.openStoredPlay({
    document: stored.document,
    documentHash: stored.documentHash,
    undoHistory: await library.getUndoHistory(playId),
    versions: await library.listPlayVersions(playId),
  });
  return true;
}

export async function createUntitledPlay(
  library: ChalkLibrary,
  editorStore: EditorStore,
  playbookDefaultProfile = editorStore.getSnapshot().document.fieldProfile,
): Promise<PlayDocument> {
  const play = emptyPlayDocument({
    playbookId: library.playbookId,
    fieldProfile: playbookDefaultProfile,
  });
  await editorStore.adoptPlay(play);
  return play;
}

export async function createLibraryVariation(input: {
  readonly library: ChalkLibrary;
  readonly editorStore: EditorStore;
  readonly snapshot: LibrarySnapshot;
  readonly variantName: string;
}): Promise<PlayDocument | undefined> {
  const variantName = input.variantName.trim();
  if (!variantName) return undefined;
  const current = input.editorStore.getSnapshot().document;
  let concept = input.snapshot.concepts.find(
    (entry) => entry.id === current.conceptSource?.conceptId,
  );
  if (!concept) {
    concept = conceptFromPlay(current, createStableId("concept"));
    const head = attachPlayToConcept(current, concept);
    await input.library.saveConcept(concept);
    await input.editorStore.applyCommand({
      kind: "set-concept-source",
      conceptSource: head.conceptSource,
    });
    if (head.name !== current.name) {
      await input.editorStore.applyCommand({
        kind: "set-play-name",
        name: concept.name,
      });
    }
  }
  const variation = createVariationPlay({
    source: input.editorStore.getSnapshot().document,
    concept,
    variantName,
  });
  await input.editorStore.adoptPlay(variation);
  return variation;
}

export function suggestedVariationName(
  play: PlayDocument,
  formations = stockFormations,
): string {
  return recognizeFormation(play, formations).formation?.name ?? "";
}

export async function detachLibraryPlay(
  library: ChalkLibrary,
  editorStore: EditorStore,
  playId: string,
): Promise<string | undefined> {
  const stored = await library.getPlay(playId);
  if (!stored?.document.conceptSource) return undefined;
  const detached = detachPlayFromConcept(stored.document);
  if (editorStore.getSnapshot().document.id === playId) {
    await editorStore.applyCommand({
      kind: "set-concept-source",
    });
    if (detached.name !== stored.document.name) {
      await editorStore.applyCommand({
        kind: "set-play-name",
        name: detached.name,
      });
    }
  } else {
    await editorStoreAdoptDetached(library, editorStore, detached);
  }
  return `${detached.name} is its own concept now`;
}

async function editorStoreAdoptDetached(
  library: ChalkLibrary,
  editorStore: EditorStore,
  detached: PlayDocument,
): Promise<void> {
  const currentId = editorStore.getSnapshot().document.id;
  const stored = await library.getPlay(detached.id);
  if (!stored) return;
  await editorStore.openStoredPlay({
    document: stored.document,
    documentHash: stored.documentHash,
    undoHistory: await library.getUndoHistory(detached.id),
    versions: await library.listPlayVersions(detached.id),
  });
  await editorStore.applyCommand({ kind: "set-concept-source" });
  await openLibraryPlay(library, editorStore, currentId);
}

export async function deleteLibraryPlay(input: {
  readonly library: ChalkLibrary;
  readonly editorStore: EditorStore;
  readonly snapshot: LibrarySnapshot;
  readonly playId: string;
}): Promise<string | undefined> {
  const { library, editorStore, snapshot, playId } = input;
  const member = snapshot.members.find((entry) => entry.playId === playId);
  const conceptId = member?.conceptId;
  const currentId = editorStore.getSnapshot().document.id;
  const siblings = snapshot.members.filter(
    (entry) => entry.conceptId === conceptId && entry.playId !== playId,
  );
  if (conceptId && member?.name === conceptNameOf(snapshot, conceptId)) {
    for (const sibling of siblings) {
      const stored = await library.getPlay(sibling.playId);
      if (!stored) continue;
      if (stored.document.id === currentId) {
        await editorStore.applyCommand({ kind: "set-concept-source" });
      } else {
        await editorStore.openStoredPlay({
          document: stored.document,
          documentHash: stored.documentHash,
          undoHistory: await library.getUndoHistory(sibling.playId),
          versions: await library.listPlayVersions(sibling.playId),
        });
        await editorStore.applyCommand({ kind: "set-concept-source" });
      }
    }
    await library.deleteConcept(conceptId);
  }
  await library.trashPlay(playId);
  if (currentId === playId) {
    const next = snapshot.members.find((entry) => entry.playId !== playId);
    if (next) await openLibraryPlay(library, editorStore, next.playId);
    else await createUntitledPlay(library, editorStore);
  } else {
    await openLibraryPlay(library, editorStore, currentId);
  }
  return undefined;
}

function conceptNameOf(
  snapshot: LibrarySnapshot,
  conceptId: string,
): string | undefined {
  return snapshot.concepts.find((concept) => concept.id === conceptId)?.name;
}

export async function broadcastCurrentCommand(input: {
  readonly library: ChalkLibrary;
  readonly editorStore: EditorStore;
  readonly snapshot: LibrarySnapshot;
  readonly command: PlayCommand;
  readonly scope: LibraryEditScope;
  readonly pickIds: readonly string[];
  readonly currentPlayId: string;
}): Promise<string | undefined> {
  const family = input.snapshot.members.filter((member) => {
    const current = input.snapshot.members.find(
      (entry) => entry.playId === input.currentPlayId,
    );
    if (!current?.conceptId) return false;
    return member.conceptId === current.conceptId;
  });
  const targets =
    input.scope === "play"
      ? []
      : input.scope === "pick"
        ? family.filter(
            (member) =>
              member.playId !== input.currentPlayId &&
              input.pickIds.includes(member.playId),
          )
        : family.filter((member) => member.playId !== input.currentPlayId);
  if (targets.length === 0) return undefined;
  const source = input.editorStore.getSnapshot().document;
  const skipped: string[] = [];
  let ok = 0;
  const returnId = source.id;
  for (const target of targets) {
    const stored = await input.library.getPlay(target.playId);
    if (!stored) continue;
    const result = propagateCommand(source, stored.document, input.command);
    const label = variantNameFrom(
      conceptNameOf(input.snapshot, target.conceptId ?? "") ?? target.name,
      target.name,
    );
    if (!result.ok) {
      skipped.push(`${label} ${result.reason}`);
      continue;
    }
    await input.editorStore.openStoredPlay({
      document: stored.document,
      documentHash: stored.documentHash,
      undoHistory: await input.library.getUndoHistory(target.playId),
      versions: await input.library.listPlayVersions(target.playId),
    });
    await input.editorStore.commitDocument(result.play);
    ok += 1;
  }
  await openLibraryPlay(input.library, input.editorStore, returnId);
  return formatBroadcastReport({
    applied: ok + 1,
    total: targets.length + 1,
    skipped,
  });
}

export async function pushFamilyAlignment(input: {
  readonly library: ChalkLibrary;
  readonly editorStore: EditorStore;
  readonly snapshot: LibrarySnapshot;
  readonly conceptId: string;
  readonly scope: LibraryEditScope;
  readonly pickIds: readonly string[];
}): Promise<string> {
  const head = input.snapshot.members.find(
    (member) =>
      member.conceptId === input.conceptId &&
      member.name ===
        input.snapshot.concepts.find(
          (concept) => concept.id === input.conceptId,
        )?.name,
  );
  const sourceId = head?.playId ?? input.editorStore.getSnapshot().document.id;
  const sourceStored = await input.library.getPlay(sourceId);
  if (!sourceStored) return "No variations to push to";
  let kids = input.snapshot.members.filter(
    (member) =>
      member.conceptId === input.conceptId && member.playId !== sourceId,
  );
  if (input.scope === "pick") {
    kids = kids.filter((member) => input.pickIds.includes(member.playId));
  }
  if (kids.length === 0) return "No variations to push to";
  const skipped: string[] = [];
  let n = 0;
  const returnId = input.editorStore.getSnapshot().document.id;
  for (const kid of kids) {
    const stored = await input.library.getPlay(kid.playId);
    if (!stored) continue;
    const result = pushAlignmentToPlay(sourceStored.document, stored.document);
    const label = variantNameFrom(
      conceptNameOf(input.snapshot, input.conceptId) ?? kid.name,
      kid.name,
    );
    if (!result.ok) {
      skipped.push(`${label} ${result.reason}`);
      continue;
    }
    await input.editorStore.openStoredPlay({
      document: stored.document,
      documentHash: stored.documentHash,
      undoHistory: await input.library.getUndoHistory(kid.playId),
    });
    await input.editorStore.commitDocument(result.play);
    n += 1;
  }
  await openLibraryPlay(input.library, input.editorStore, returnId);
  return skipped.length
    ? `Pushed to ${n} of ${kids.length} — ${skipped[0]}`
    : `Alignment pushed to ${n}${n === 1 ? " variation" : " variations"}`;
}

export function membersToRows(members: readonly PlaySearchProjection[]): {
  readonly playId: string;
  readonly name: string;
  readonly unit: PlaySearchProjection["unit"];
  readonly playTypeName?: string;
  readonly conceptId?: string;
  readonly tags: readonly string[];
  readonly updatedAtMs: number;
}[] {
  return members.map((member) => ({
    playId: member.playId,
    name: member.name,
    unit: member.unit,
    ...(member.playTypeName === undefined
      ? {}
      : { playTypeName: member.playTypeName }),
    ...(member.conceptId === undefined ? {} : { conceptId: member.conceptId }),
    tags: member.tags,
    updatedAtMs: member.updatedAtMs,
  }));
}

export async function saveConceptMeta(
  library: ChalkLibrary,
  concept: Concept,
  notes: string,
  tags: string,
): Promise<Concept> {
  const next: Concept = {
    ...concept,
    notes: notes.slice(0, 90),
    tags: tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 5),
    revision: concept.revision + 1,
  };
  await library.saveConcept(next);
  return next;
}

export function stepFamilyPlayId(
  currentPlayId: string,
  snapshot: LibrarySnapshot,
  direction: -1 | 1,
): string | undefined {
  const family = snapshot.members.filter((member) => {
    const current = snapshot.members.find(
      (entry) => entry.playId === currentPlayId,
    );
    if (!current?.conceptId) return member.playId === currentPlayId;
    return member.conceptId === current.conceptId;
  });
  if (family.length < 2) return undefined;
  const index = family.findIndex((member) => member.playId === currentPlayId);
  if (index < 0) return undefined;
  const next = family[(index + direction + family.length) % family.length];
  return next && next.playId !== currentPlayId ? next.playId : undefined;
}

/**
 * Production saves continuously, so the original's "dirty library record" is
 * gone. Switching still waits out an in-flight save and refuses a failed one
 * (parity-matrix B2).
 */
export function canSwitchPlay(phase: string): boolean {
  return phase !== "error";
}
