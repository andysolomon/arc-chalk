import {
  commandBroadcasts,
  familyOf,
  libraryDisclosureDefault,
  libraryScopeAfterToggle,
  libraryScopeBadge,
  libraryScopeTargets,
  presentVariationLine,
  type LibraryEditScope,
  type PlayCommand,
} from "@chalk/domain";
import type { EditorStore } from "@chalk/editor";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  emptyLibrarySnapshot,
  type ChalkRuntime,
  type LibraryBrowserState,
  type LibrarySnapshot,
} from "../app/editor-runtime";
import {
  broadcastCurrentCommand,
  canSwitchPlay,
  createLibraryVariation,
  createUntitledPlay,
  deleteLibraryPlay,
  detachLibraryPlay,
  openLibraryPlay,
  pushFamilyAlignment,
  saveConceptMeta,
  stepFamilyPlayId,
  suggestedVariationName,
} from "./library-actions";

/** How long a "send this to the other versions" offer stays on the field. */
export const BROADCAST_OFFER_MS = 8_000;

/**
 * Route work done in "This play" that could have gone to the siblings. The
 * edits coalesce so a run of drags is one offer, not ten.
 */
export interface BroadcastOffer {
  readonly edits: number;
  readonly others: number;
}

export function usePlaybookLibrary(
  runtime: ChalkRuntime,
  editorStore: EditorStore,
) {
  const { library } = runtime;
  const playId = useSyncExternalStore(
    editorStore.subscribe,
    () => editorStore.getSnapshot().document.id,
    () => editorStore.getSnapshot().document.id,
  );
  const [snapshot, setSnapshot] = useState<LibrarySnapshot>(() =>
    emptyLibrarySnapshot(),
  );
  const [storedOpen, setStoredOpen] = useState<
    Readonly<Record<string, boolean>>
  >({});
  const [browserState, setBrowserState] = useState<LibraryBrowserState>({
    scrollTop: 0,
    query: "",
  });
  const [scope, setScope] = useState<LibraryEditScope>("play");
  const [pickIds, setPickIds] = useState<readonly string[]>([]);
  const [variationOpen, setVariationOpen] = useState(false);
  const [variationDraft, setVariationDraft] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [report, setReport] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState<BroadcastOffer>();
  const snapshotRef = useRef(snapshot);
  const scopeRef = useRef(scope);
  const pickRef = useRef(pickIds);
  // Broadcasts drive the live editor store through each sibling, so they
  // run one at a time and the field is held while they do.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const offeredRef = useRef<PlayCommand[]>([]);
  const offerTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    snapshotRef.current = snapshot;
    scopeRef.current = scope;
    pickRef.current = pickIds;
  });

  const dropOffer = useCallback(() => {
    offeredRef.current = [];
    if (offerTimerRef.current) window.clearTimeout(offerTimerRef.current);
    offerTimerRef.current = undefined;
    setOffer(undefined);
  }, []);
  useEffect(() => dropOffer, [dropOffer]);

  const refresh = useCallback(async () => {
    const next = await library.loadSnapshot();
    if (next) setSnapshot(next);
  }, [library]);

  useEffect(() => {
    let cancelled = false;
    void library.loadSnapshot().then((next) => {
      if (!cancelled && next) setSnapshot(next);
    });
    void library.loadDisclosure().then((open) => {
      if (!cancelled) setStoredOpen(open);
    });
    void library.loadBrowserState().then((state) => {
      if (!cancelled) setBrowserState(state);
    });
    return () => {
      cancelled = true;
    };
  }, [library]);

  const loadPlay = useCallback(
    async (playId: string): Promise<boolean> => {
      if (!canSwitchPlay(editorStore.getSnapshot().localSave.phase)) {
        return false;
      }
      const opened = await openLibraryPlay(library, editorStore, playId);
      if (opened) await refresh();
      return opened;
    },
    [editorStore, library, refresh],
  );

  const savePlay = useCallback(() => {
    void editorStore.commitPlayName();
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1_200);
    void refresh();
  }, [editorStore, refresh]);

  const startVariation = useCallback(() => {
    setVariationDraft(
      suggestedVariationName(editorStore.getSnapshot().document),
    );
    setVariationOpen(true);
  }, [editorStore]);

  const cancelVariation = useCallback(() => {
    setVariationOpen(false);
    setVariationDraft("");
  }, []);

  const commitVariation = useCallback(() => {
    const name = variationDraft;
    setVariationOpen(false);
    setVariationDraft("");
    void createLibraryVariation({
      library,
      editorStore,
      snapshot: snapshotRef.current,
      variantName: name,
    }).then((play) => {
      if (play) void refresh();
    });
  }, [editorStore, library, refresh, variationDraft]);

  const newPlay = useCallback(() => {
    void createUntitledPlay(library, editorStore).then(() => refresh());
  }, [editorStore, library, refresh]);

  const detach = useCallback(
    (playId: string) => {
      void detachLibraryPlay(library, editorStore, playId).then((message) => {
        if (message) setReport(message);
        return refresh();
      });
    },
    [editorStore, library, refresh],
  );

  const removePlay = useCallback(
    (playId: string, confirm: boolean) => {
      if (!confirm) return;
      void deleteLibraryPlay({
        library,
        editorStore,
        snapshot: snapshotRef.current,
        playId,
      }).then(() => refresh());
    },
    [editorStore, library, refresh],
  );

  const push = useCallback(
    (conceptId: string) => {
      void pushFamilyAlignment({
        library,
        editorStore,
        snapshot: snapshotRef.current,
        conceptId,
        scope: scopeRef.current,
        pickIds: pickRef.current,
      }).then((message) => {
        setReport(message);
        return refresh();
      });
    },
    [editorStore, library, refresh],
  );

  const noteCommit = useCallback(
    (conceptId: string, notes: string, tags: string) => {
      const concept = snapshotRef.current.concepts.find(
        ({ id }) => id === conceptId,
      );
      if (!concept) return;
      void saveConceptMeta(library, concept, notes, tags).then(() => refresh());
    },
    [library, refresh],
  );

  const toggleOpen = useCallback(
    (conceptId: string) => {
      setStoredOpen((current) => {
        const showing = libraryDisclosureDefault(
          conceptId,
          editorStore.getSnapshot().document.conceptSource?.conceptId,
          current,
        );
        const recorded = { ...current, [conceptId]: !showing };
        void library.saveDisclosure(recorded);
        return recorded;
      });
    },
    [editorStore, library],
  );

  const rememberBrowser = useCallback(
    (state: LibraryBrowserState) => {
      setBrowserState(state);
      void library.saveBrowserState(state);
    },
    [library],
  );

  const runBroadcast = useCallback(
    (
      command: PlayCommand,
      scope: LibraryEditScope,
      pickIds: readonly string[],
    ) => {
      setBusy(true);
      queueRef.current = queueRef.current
        .then(() =>
          broadcastCurrentCommand({
            library,
            editorStore,
            snapshot: snapshotRef.current,
            command,
            scope,
            pickIds,
            currentPlayId: editorStore.getSnapshot().document.id,
          }),
        )
        .then((message) => {
          if (message) setReport(message);
          return refresh();
        })
        .catch(() => undefined)
        .then(() => setBusy(false));
    },
    [editorStore, library, refresh],
  );

  const maybeBroadcast = useCallback(
    (command: PlayCommand) => {
      if (!commandBroadcasts(command)) return;
      if (scopeRef.current !== "play") {
        runBroadcast(command, scopeRef.current, pickRef.current);
        return;
      }
      const playId = editorStore.getSnapshot().document.id;
      const members = snapshotRef.current.members;
      const conceptId = members.find((m) => m.playId === playId)?.conceptId;
      if (!conceptId) return;
      const others = members.filter(
        (m) => m.conceptId === conceptId && m.playId !== playId,
      ).length;
      if (others === 0) return;
      offeredRef.current = [...offeredRef.current, command];
      if (offerTimerRef.current) window.clearTimeout(offerTimerRef.current);
      offerTimerRef.current = window.setTimeout(dropOffer, BROADCAST_OFFER_MS);
      setOffer({ edits: offeredRef.current.length, others });
    },
    [dropOffer, editorStore, runBroadcast],
  );

  /** The offer taken: replay the coalesced edits onto every sibling. */
  const acceptOffer = useCallback(() => {
    const commands = offeredRef.current;
    dropOffer();
    if (commands.length === 0) return;
    // A batch holds one level of steps, so earlier batches are unrolled.
    const steps = commands.flatMap((command) =>
      command.kind === "batch" ? command.commands : [command],
    );
    runBroadcast(
      commands.length === 1
        ? commands[0]!
        : { kind: "batch", label: "Send to versions", commands: steps },
      "concept",
      [],
    );
  }, [dropOffer, runBroadcast]);

  const stepFamily = useCallback(
    (direction: -1 | 1) => {
      const next = stepFamilyPlayId(
        editorStore.getSnapshot().document.id,
        snapshotRef.current,
        direction,
      );
      if (next) void loadPlay(next);
    },
    [editorStore, loadPlay],
  );

  const presentLine = useMemo(
    () =>
      presentVariationLine(
        playId,
        snapshot.members.map((member) => ({
          playId: member.playId,
          name: member.name,
          unit: member.unit,
          tags: member.tags,
          updatedAtMs: member.updatedAtMs,
          ...(member.playTypeName === undefined
            ? {}
            : { playTypeName: member.playTypeName }),
          ...(member.conceptId === undefined
            ? {}
            : { conceptId: member.conceptId }),
        })),
        snapshot.concepts,
      ),
    [playId, snapshot],
  );
  const familyMembers = useMemo(
    () =>
      familyOf(
        playId,
        snapshot.members.map((member) => ({
          playId: member.playId,
          name: member.name,
          unit: member.unit,
          tags: member.tags,
          updatedAtMs: member.updatedAtMs,
          ...(member.conceptId === undefined
            ? {}
            : { conceptId: member.conceptId }),
        })),
      ),
    [playId, snapshot.members],
  );
  const targetCount = libraryScopeTargets(
    scope,
    playId,
    familyMembers,
    pickIds,
  ).length;
  const conceptScope = targetCount > 0;
  const scopeBadge = libraryScopeBadge(
    scope,
    targetCount,
    familyMembers.length,
  );
  const conceptName = useMemo(() => {
    const conceptId = snapshot.members.find(
      (m) => m.playId === playId,
    )?.conceptId;
    return snapshot.concepts.find(({ id }) => id === conceptId)?.name;
  }, [playId, snapshot]);

  // A broadcast mode never outlives the family it was aimed at: leaving the
  // concept — or opening a play with none — drops back to "This play".
  const conceptKey = useMemo(
    () => snapshot.members.find((m) => m.playId === playId)?.conceptId ?? "",
    [playId, snapshot.members],
  );
  const lastConceptRef = useRef(conceptKey);
  useEffect(() => {
    if (lastConceptRef.current === conceptKey) return;
    lastConceptRef.current = conceptKey;
    setScope("play");
    setPickIds([]);
    dropOffer();
  }, [conceptKey, dropOffer]);

  const toggleTarget = useCallback(
    (targetId: string) => {
      const siblings = familyMembers
        .filter((m) => m.playId !== playId)
        .map((m) => m.playId);
      const next = libraryScopeAfterToggle(scope, pickIds, siblings, targetId);
      setScope(next.scope);
      setPickIds(next.pickIds);
    },
    [familyMembers, pickIds, playId, scope],
  );
  const chooseScope = useCallback((next: LibraryEditScope) => {
    setScope(next);
    setPickIds([]);
  }, []);

  return {
    snapshot,
    storedOpen,
    browserState,
    scope,
    pickIds,
    variationOpen,
    variationDraft,
    savedFlash,
    report,
    busy,
    offer,
    presentLine,
    conceptScope,
    scopeBadge,
    conceptName,
    familySize: familyMembers.length,
    refresh,
    loadPlay,
    savePlay,
    startVariation,
    cancelVariation,
    commitVariation,
    setVariationDraft,
    newPlay,
    detach,
    removePlay,
    push,
    noteCommit,
    toggleOpen,
    rememberBrowser,
    maybeBroadcast,
    stepFamily,
    setScope: chooseScope,
    togglePick: toggleTarget,
    acceptOffer,
    dropOffer,
  };
}
