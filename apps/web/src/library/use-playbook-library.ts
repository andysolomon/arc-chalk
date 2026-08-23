import {
  commandBroadcasts,
  familyOf,
  libraryDisclosureDefault,
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
  togglePickId,
} from "./library-actions";

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
  const snapshotRef = useRef(snapshot);
  const scopeRef = useRef(scope);
  const pickRef = useRef(pickIds);

  useEffect(() => {
    snapshotRef.current = snapshot;
    scopeRef.current = scope;
    pickRef.current = pickIds;
  });

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

  const maybeBroadcast = useCallback(
    (command: PlayCommand) => {
      if (!commandBroadcasts(command) || scopeRef.current === "play") return;
      void broadcastCurrentCommand({
        library,
        editorStore,
        snapshot: snapshotRef.current,
        command,
        scope: scopeRef.current,
        pickIds: pickRef.current,
        currentPlayId: editorStore.getSnapshot().document.id,
      }).then((message) => {
        if (message) setReport(message);
        return refresh();
      });
    },
    [editorStore, library, refresh],
  );

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
  const conceptScope =
    libraryScopeTargets(scope, playId, familyMembers, pickIds).length > 0;

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
    presentLine,
    conceptScope,
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
    setScope,
    togglePick: (playId: string) =>
      setPickIds((ids) => togglePickId(ids, playId)),
  };
}
