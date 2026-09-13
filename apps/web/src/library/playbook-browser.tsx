import {
  UNCLASSIFIED_PLAY_TYPE_NAME,
  formatClassification,
  playUnits,
  type PlayTypeDefinition,
  type PlayUnit,
} from "@chalk/domain";
import type { PlaySearchProjection } from "@chalk/local-db";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ChalkLibrary, LibraryBrowserState } from "../app/editor-runtime";
import {
  createPlaySearchClient,
  projectionsForHits,
} from "./play-search-client";
import { UNCLASSIFIED, typeChipsFor } from "./type-chips";
import {
  createThumbnailScheduler,
  thumbnailRequestFrom,
  type ThumbnailRequest,
} from "./thumbnail-scheduler";

const GRID_COLUMNS = 4;
const CARD_ROW_HEIGHT = 118;

const UNITS: readonly {
  readonly id: "all" | PlayUnit;
  readonly name: string;
}[] = [{ id: "all", name: "All" }, ...playUnits];

export function PlaybookBrowser({
  currentPlayId,
  embedded = false,
  initial,
  library,
  members,
  onClose,
  onOpen,
  onOpenGamePlans,
  onRemember,
  playTypes,
}: {
  currentPlayId: string;
  /**
   * Shown as a page of the Playbooks destination rather than a dialog over
   * the editor (issue #65): no backdrop, no close, and a click outside the
   * cards is not a way out.
   */
  embedded?: boolean;
  initial: LibraryBrowserState;
  library: ChalkLibrary;
  members: readonly PlaySearchProjection[];
  onClose: () => void;
  onOpen: (playId: string) => void;
  /** The Playbooks workspace (issue #66), reached from the library it curates. */
  onOpenGamePlans?: () => void;
  onRemember: (state: LibraryBrowserState) => void;
  playTypes: readonly PlayTypeDefinition[];
}) {
  const [query, setQuery] = useState(initial.query);
  const [unit, setUnit] = useState<"all" | PlayUnit>("all");
  const [playType, setPlayType] = useState("all");
  const [hits, setHits] = useState<readonly PlaySearchProjection[]>(members);
  const [focusedPlayId, setFocusedPlayId] = useState(initial.focusedPlayId);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const search = useMemo(() => createPlaySearchClient(), []);
  const thumbnails = useMemo(
    () => createThumbnailScheduler(library),
    [library],
  );

  useEffect(() => () => search.dispose(), [search]);
  useEffect(() => () => thumbnails.dispose(), [thumbnails]);

  const typeChips = useMemo(
    () => typeChipsFor(playTypes, members, unit),
    [members, playTypes, unit],
  );

  const scoped = useMemo(
    () =>
      members.filter(
        (member) =>
          (unit === "all" || member.unit === unit) &&
          (playType === "all" ||
            (playType === UNCLASSIFIED
              ? member.playTypeId === undefined
              : member.playTypeId === playType)),
      ),
    [members, playType, unit],
  );

  // A Type belongs to its Unit, so a chip lit under Defense means nothing
  // once Offense is chosen; the Type filter opens back up with the Unit.
  const chooseUnit = (next: "all" | PlayUnit) => {
    setUnit(next);
    if (
      playType !== "all" &&
      playType !== UNCLASSIFIED &&
      !typeChipsFor(playTypes, members, next).some(({ id }) => id === playType)
    ) {
      setPlayType("all");
    }
  };

  useEffect(() => {
    let cancelled = false;
    void search.search(scoped, { text: query }).then((ranked) => {
      if (cancelled) return;
      setHits(projectionsForHits(scoped, ranked));
    });
    return () => {
      cancelled = true;
    };
  }, [query, scoped, search]);

  const rows = useMemo(() => {
    const grouped: PlaySearchProjection[][] = [];
    for (let index = 0; index < hits.length; index += GRID_COLUMNS) {
      grouped.push(hits.slice(index, index + GRID_COLUMNS));
    }
    return grouped;
  }, [hits]);

  // TanStack Virtual returns functions the compiler cannot memoize.
  // eslint-disable-next-line react-hooks/incompatible-library -- virtualizer API
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => CARD_ROW_HEIGHT,
    overscan: 6,
  });

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || restoredRef.current) return;
    restoredRef.current = true;
    node.scrollTop = initial.scrollTop;
    if (initial.focusedPlayId) {
      const index = hits.findIndex(
        (member) => member.playId === initial.focusedPlayId,
      );
      if (index >= 0) {
        virtualizer.scrollToIndex(Math.floor(index / GRID_COLUMNS));
      }
    }
  }, [hits, initial.focusedPlayId, initial.scrollTop, virtualizer]);

  const remember = (playId?: string) => {
    onRemember({
      scrollTop: scrollerRef.current?.scrollTop ?? 0,
      query,
      ...((playId ?? focusedPlayId)
        ? { focusedPlayId: playId ?? focusedPlayId }
        : {}),
    });
  };

  const urlFor = (request: ThumbnailRequest, signal?: AbortSignal) =>
    thumbnails.urlFor(request, signal);

  return (
    <div
      className={`overlay browser-overlay${embedded ? " embedded" : ""}`}
      onClick={
        embedded
          ? undefined
          : () => {
              remember();
              onClose();
            }
      }
      role="presentation"
    >
      <div
        aria-label="Playbook"
        className="browser playbook-browser"
        onClick={(event) => event.stopPropagation()}
        role={embedded ? "region" : "dialog"}
      >
        <div className="browser-head">
          <div className="browser-title">Playbook</div>
          <input
            aria-label="Search plays"
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search — stick, thunder, red zone…"
            spellCheck={false}
            value={query}
          />
          {onOpenGamePlans ? (
            <button
              className="browser-link"
              onClick={() => {
                remember();
                onOpenGamePlans();
              }}
              title="Pick, arrange and number the calls for one game"
              type="button"
            >
              Game plans
            </button>
          ) : null}
          {embedded ? null : (
            <button
              className="browser-close"
              onClick={() => {
                remember();
                onClose();
              }}
              type="button"
            >
              ×
            </button>
          )}
        </div>
        <div className="browser-filter">
          <span>Unit</span>
          <div className="chip-row">
            {UNITS.map((choice) => (
              <button
                className={unit === choice.id ? "chip active" : "chip"}
                key={choice.id}
                onClick={() => chooseUnit(choice.id)}
                type="button"
              >
                {choice.name}
              </button>
            ))}
          </div>
        </div>
        <div className="browser-filter">
          <span>Type</span>
          <div className="chip-row">
            <button
              className={playType === "all" ? "chip active" : "chip"}
              onClick={() => setPlayType("all")}
              type="button"
            >
              All
            </button>
            {typeChips.map((chip) => (
              <button
                className={playType === chip.id ? "chip active" : "chip"}
                key={chip.id}
                onClick={() => setPlayType(chip.id)}
                type="button"
              >
                {chip.name}
              </button>
            ))}
            <button
              className={playType === UNCLASSIFIED ? "active" : undefined}
              onClick={() => setPlayType(UNCLASSIFIED)}
              title="Plays left at their unit with no type chosen"
              type="button"
            >
              {UNCLASSIFIED_PLAY_TYPE_NAME}
            </button>
          </div>
        </div>
        <div
          className="browser-body playbook-scroll"
          data-virtual-count={hits.length}
          onScroll={() => remember()}
          ref={scrollerRef}
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
              width: "100%",
            }}
          >
            {virtualizer.getVirtualItems().map((row) => {
              const cards = rows[row.index] ?? [];
              return (
                <div
                  className="browser-grid playbook-virtual-row"
                  data-index={row.index}
                  key={row.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${row.start}px)`,
                  }}
                >
                  {cards.map((member) => (
                    <PlayCard
                      current={member.playId === currentPlayId}
                      focused={member.playId === focusedPlayId}
                      key={member.playId}
                      member={member}
                      onFocus={() => setFocusedPlayId(member.playId)}
                      onOpen={() => {
                        remember(member.playId);
                        onOpen(member.playId);
                      }}
                      urlFor={urlFor}
                    />
                  ))}
                </div>
              );
            })}
          </div>
          {hits.length === 0 ? (
            <p className="playbook-empty">No plays match that search.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PlayCard({
  current,
  focused,
  member,
  onFocus,
  onOpen,
  urlFor,
}: {
  current: boolean;
  focused: boolean;
  member: PlaySearchProjection;
  onFocus: () => void;
  onOpen: () => void;
  urlFor: (
    request: ThumbnailRequest,
    signal?: AbortSignal,
  ) => Promise<string | undefined>;
}) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    const abort = new AbortController();
    void urlFor(thumbnailRequestFrom(member), abort.signal).then((url) => {
      if (!abort.signal.aborted && url) setSrc(url);
    });
    return () => abort.abort();
  }, [member, urlFor]);

  return (
    <button
      className={`browser-card playbook-card${current ? " current" : ""}${
        focused ? " focused" : ""
      }`}
      data-play-id={member.playId}
      onClick={onOpen}
      onFocus={onFocus}
      type="button"
    >
      <div className="playbook-thumb">
        {src ? (
          <img alt="" src={src} />
        ) : (
          <span className="playbook-thumb-wait" />
        )}
      </div>
      <div className="browser-name-row">
        <strong>{member.name}</strong>
      </div>
      <span>
        {formatClassification({
          unit: member.unit,
          ...(member.playTypeId === undefined
            ? {}
            : {
                playType: {
                  id: member.playTypeId,
                  name: member.playTypeName ?? member.playTypeId,
                },
              }),
        })}
        {member.tags[0] ? ` · ${member.tags[0]}` : ""}
      </span>
    </button>
  );
}
