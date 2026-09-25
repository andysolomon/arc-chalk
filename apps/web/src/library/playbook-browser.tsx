import {
  UNCLASSIFIED_PLAY_TYPE_NAME,
  CLASSIFICATION_SEPARATOR,
  playUnits,
  type PlayTypeDefinition,
  type PlayUnit,
} from "@chalk/domain";
import type { PlaySearchProjection } from "@chalk/local-db";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  ChalkLibrary,
  LibraryBrowserState,
  PlaybookSort,
} from "../app/editor-runtime";
import { UnitBadge } from "../components/unit-badge";
import {
  gridColumnsFor,
  NARROW_BROWSER_QUERY,
  PLAY_CARD_ROW_GAP,
  PLAY_LIST_ROW_HEIGHT,
  playCardRowHeightFor,
} from "./grid-columns";
import {
  createPlaySearchClient,
  projectionsForHits,
} from "./play-search-client";
import { sortPlays } from "./play-order";
import { UNCLASSIFIED, typeChipsFor } from "./type-chips";
import {
  createThumbnailScheduler,
  thumbnailRequestFrom,
  type ThumbnailRequest,
} from "./thumbnail-scheduler";

function useNarrowBrowser(): boolean {
  const [narrow, setNarrow] = useState(
    () =>
      typeof globalThis.matchMedia === "function" &&
      globalThis.matchMedia(NARROW_BROWSER_QUERY).matches,
  );
  useEffect(() => {
    if (typeof globalThis.matchMedia !== "function") return;
    const query = globalThis.matchMedia(NARROW_BROWSER_QUERY);
    const read = () => setNarrow(query.matches);
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);
  return narrow;
}

function playCount(count: number): string {
  return `${count} ${count === 1 ? "play" : "plays"}`;
}

export function PlaybookBrowser({
  currentPlayId,
  deletePrompt,
  embedded = false,
  focusSearch = true,
  initial,
  library,
  members,
  onClose,
  onDelete,
  onOpen,
  onOpenGamePlans,
  onRemember,
  playTypes,
}: {
  currentPlayId: string;
  /** What deleting this Play also does, said before the Coach confirms. */
  deletePrompt?: (playId: string) => string;
  /**
   * Shown as a page of the Playbooks destination rather than a dialog over
   * the editor (issue #65): no backdrop, no close, and a click outside the
   * cards is not a way out. The page is where the Playbook is managed, so a
   * Play there carries its own actions and, on a phone, reads as a list.
   */
  embedded?: boolean;
  /**
   * Whether search takes focus as the browser opens. A keyboard wants it; a
   * finger does not want the keyboard raised over the cards (issue #68).
   */
  focusSearch?: boolean;
  initial: LibraryBrowserState;
  library: ChalkLibrary;
  members: readonly PlaySearchProjection[];
  onClose: () => void;
  /** Removes a Play from the Playbook; offered on the page only. */
  onDelete?: (playId: string) => void;
  onOpen: (playId: string) => void;
  /** The Playbooks workspace (issue #66), reached from the library it curates. */
  onOpenGamePlans?: () => void;
  onRemember: (state: LibraryBrowserState) => void;
  playTypes: readonly PlayTypeDefinition[];
}) {
  const [query, setQuery] = useState(initial.query);
  const [unit, setUnit] = useState<"all" | PlayUnit>("all");
  const [playType, setPlayType] = useState("all");
  const [sort, setSort] = useState<PlaybookSort>(initial.sort ?? "name");
  const [hits, setHits] = useState<readonly PlaySearchProjection[]>(members);
  const [focusedPlayId, setFocusedPlayId] = useState(initial.focusedPlayId);
  const [actionsFor, setActionsFor] = useState<string>();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const narrow = useNarrowBrowser();
  const list = embedded && narrow;
  const rowHeight = list ? PLAY_LIST_ROW_HEIGHT : playCardRowHeightFor(narrow);
  const [gridColumns, setGridColumns] = useState(() =>
    gridColumnsFor(scrollerRef.current?.clientWidth ?? 0),
  );
  const columns = list ? 1 : gridColumns;
  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? node.clientWidth;
      setGridColumns(gridColumnsFor(width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
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

  const searching = query.trim() !== "";
  const shown = useMemo(
    () => (searching ? hits : sortPlays(hits, sort)),
    [hits, searching, sort],
  );
  const narrowed = searching || unit !== "all" || playType !== "all";

  const rows = useMemo(() => {
    const grouped: PlaySearchProjection[][] = [];
    for (let index = 0; index < shown.length; index += columns) {
      grouped.push(shown.slice(index, index + columns));
    }
    return grouped;
  }, [columns, shown]);

  // TanStack Virtual returns functions the compiler cannot memoize.
  // eslint-disable-next-line react-hooks/incompatible-library -- virtualizer API
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => rowHeight,
    overscan: 6,
  });
  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, virtualizer]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || restoredRef.current) return;
    restoredRef.current = true;
    node.scrollTop = initial.scrollTop;
    if (initial.focusedPlayId) {
      const index = shown.findIndex(
        (member) => member.playId === initial.focusedPlayId,
      );
      if (index >= 0) {
        virtualizer.scrollToIndex(Math.floor(index / columns));
      }
    }
  }, [columns, shown, initial.focusedPlayId, initial.scrollTop, virtualizer]);

  // A reflow regroups every row, so the card the Coach was on would land on
  // a different row than the one he is scrolled to. Keep it in view.
  const columnsSeenRef = useRef(columns);
  useEffect(() => {
    if (columnsSeenRef.current === columns) return;
    columnsSeenRef.current = columns;
    virtualizer.measure();
    if (!focusedPlayId) return;
    const index = shown.findIndex((member) => member.playId === focusedPlayId);
    if (index >= 0) virtualizer.scrollToIndex(Math.floor(index / columns));
  }, [columns, focusedPlayId, shown, virtualizer]);

  const remember = (
    playId?: string,
    next: { readonly sort?: PlaybookSort } = {},
  ) => {
    onRemember({
      scrollTop: scrollerRef.current?.scrollTop ?? 0,
      query,
      sort: next.sort ?? sort,
      ...((playId ?? focusedPlayId)
        ? { focusedPlayId: playId ?? focusedPlayId }
        : {}),
    });
  };

  const clearFilters = () => {
    setQuery("");
    setUnit("all");
    setPlayType("all");
  };

  const open = (playId: string) => {
    remember(playId);
    onOpen(playId);
  };

  const urlFor = (request: ThumbnailRequest, signal?: AbortSignal) =>
    thumbnails.urlFor(request, signal);

  const searchInput = (
    <input
      aria-label="Search plays"
      autoFocus={focusSearch}
      onChange={(event) => setQuery(event.target.value)}
      onKeyDown={(event) => {
        // On the page, Escape empties the search first and then goes back
        // to the editor, as it does from anywhere else on the page.
        if (!embedded || event.key !== "Escape") return;
        event.preventDefault();
        if (query) {
          setQuery("");
        } else {
          remember();
          onClose();
        }
      }}
      placeholder={
        embedded ? "Search plays" : "Search — stick, thunder, red zone…"
      }
      spellCheck={false}
      value={query}
    />
  );

  const actionsMember = shown.find((member) => member.playId === actionsFor);

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
        {embedded ? null : (
          <div className="browser-head">
            <div className="browser-title">Playbook</div>
            {searchInput}
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
          </div>
        )}
        <div className="playbook-tools">
          {embedded ? (
            <div className="playbook-search">
              <SearchGlyph />
              {searchInput}
            </div>
          ) : null}
          {/* Unit and Type are one row of switches: a lit chip narrows the
              book, and a second press opens it back up. */}
          <div
            aria-label="Filter plays"
            className="playbook-filters"
            role="group"
          >
            {playUnits.map((choice) => (
              <button
                aria-pressed={unit === choice.id}
                className={unit === choice.id ? "chip active" : "chip"}
                data-unit={choice.id}
                key={choice.id}
                onClick={() =>
                  chooseUnit(unit === choice.id ? "all" : choice.id)
                }
                type="button"
              >
                {choice.name}
              </button>
            ))}
            <span aria-hidden="true" className="playbook-filters-rule" />
            {typeChips.map((chip) => (
              <button
                aria-pressed={playType === chip.id}
                className={playType === chip.id ? "chip active" : "chip"}
                key={chip.id}
                onClick={() =>
                  setPlayType(playType === chip.id ? "all" : chip.id)
                }
                type="button"
              >
                {chip.name}
              </button>
            ))}
            <button
              aria-pressed={playType === UNCLASSIFIED}
              className={playType === UNCLASSIFIED ? "chip active" : "chip"}
              onClick={() =>
                setPlayType(playType === UNCLASSIFIED ? "all" : UNCLASSIFIED)
              }
              title="Plays left at their unit with no type chosen"
              type="button"
            >
              {UNCLASSIFIED_PLAY_TYPE_NAME}
            </button>
          </div>
          <div className="playbook-summary">
            <span aria-live="polite" className="playbook-count">
              {narrowed
                ? `${shown.length} of ${playCount(members.length)}`
                : playCount(members.length)}
            </span>
            {narrowed ? (
              <button
                className="playbook-clear"
                onClick={clearFilters}
                type="button"
              >
                Clear
              </button>
            ) : null}
            {searching ? (
              <span className="playbook-order">Best match</span>
            ) : (
              <label className="playbook-order">
                <span>Sort</span>
                <select
                  aria-label="Sort plays"
                  onChange={(event) => {
                    const next = event.target.value as PlaybookSort;
                    setSort(next);
                    remember(undefined, { sort: next });
                  }}
                  value={sort}
                >
                  <option value="name">Name</option>
                  <option value="recent">Recently edited</option>
                </select>
              </label>
            )}
          </div>
        </div>
        <div
          className="browser-body playbook-scroll"
          data-card-row-height={rowHeight}
          data-grid-columns={columns}
          data-layout={list ? "list" : "grid"}
          data-virtual-count={shown.length}
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
                    height: row.size,
                    paddingBottom: list ? 0 : PLAY_CARD_ROW_GAP,
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    transform: `translateY(${row.start}px)`,
                  }}
                >
                  {cards.map((member) => (
                    <PlayItem
                      current={member.playId === currentPlayId}
                      focused={member.playId === focusedPlayId}
                      key={member.playId}
                      layout={list ? "list" : "grid"}
                      member={member}
                      onActions={
                        embedded && onDelete
                          ? () => setActionsFor(member.playId)
                          : undefined
                      }
                      onFocus={() => setFocusedPlayId(member.playId)}
                      onOpen={() => open(member.playId)}
                      urlFor={urlFor}
                    />
                  ))}
                </div>
              );
            })}
          </div>
          {members.length === 0 ? (
            <div className="playbook-none">
              <strong>No plays yet</strong>
              <span>
                {embedded
                  ? "Start one with New play. Every play you draw is kept here."
                  : "Every play you draw is kept here."}
              </span>
            </div>
          ) : shown.length === 0 ? (
            <div className="playbook-none">
              <strong>No plays match</strong>
              <button
                className="playbook-clear"
                onClick={clearFilters}
                type="button"
              >
                Clear search and filters
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {actionsMember && onDelete ? (
        <PlayActions
          current={actionsMember.playId === currentPlayId}
          detail={deletePrompt?.(actionsMember.playId)}
          member={actionsMember}
          onClose={() => setActionsFor(undefined)}
          onDelete={() => {
            setActionsFor(undefined);
            onDelete(actionsMember.playId);
          }}
          onOpen={() => {
            setActionsFor(undefined);
            open(actionsMember.playId);
          }}
        />
      ) : null}
    </div>
  );
}

function SearchGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="playbook-search-glyph"
      viewBox="0 0 16 16"
    >
      <circle cx="7" cy="7" fill="none" r="4.75" strokeWidth="1.5" />
      <path d="m10.5 10.5 3.25 3.25" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

function PlayMeta({ member }: { member: PlaySearchProjection }) {
  const type =
    member.playTypeId === undefined
      ? undefined
      : (member.playTypeName ?? member.playTypeId);
  return (
    <span className="playbook-card-type">
      <UnitBadge unit={member.unit} />
      {type === undefined ? "" : `${CLASSIFICATION_SEPARATOR}${type}`}
      {member.tags[0] ? `${CLASSIFICATION_SEPARATOR}${member.tags[0]}` : ""}
    </span>
  );
}

/**
 * One Play in the book. The frame holds the Play; the button inside it opens
 * the Play, and on the Playbooks page a second button beside it offers what
 * else can be done with it.
 */
function PlayItem({
  current,
  focused,
  layout,
  member,
  onActions,
  onFocus,
  onOpen,
  urlFor,
}: {
  current: boolean;
  focused: boolean;
  layout: "grid" | "list";
  member: PlaySearchProjection;
  onActions?: () => void;
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

  const thumb = (
    <div className="playbook-thumb">
      {src ? (
        <img alt="" src={src} />
      ) : (
        <span className="playbook-thumb-wait" />
      )}
    </div>
  );
  const frame =
    layout === "list" ? "playbook-row" : "browser-card playbook-card";

  return (
    <div
      className={`${frame}${current ? " current" : ""}${
        focused ? " focused" : ""
      }`}
      data-play-id={member.playId}
    >
      <button
        className="playbook-open"
        onClick={onOpen}
        onFocus={onFocus}
        type="button"
      >
        {thumb}
        <span className="playbook-text">
          <strong>{member.name}</strong>
          <span className="playbook-meta">
            <PlayMeta member={member} />
            {current && layout === "list" ? (
              <span className="playbook-editing">In editor</span>
            ) : null}
          </span>
        </span>
      </button>
      {onActions ? (
        <button
          aria-haspopup="dialog"
          aria-label={`Actions for ${member.name}`}
          className="playbook-more"
          onClick={onActions}
          title="Open or delete"
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16">
            <circle cx="3" cy="8" r="1.4" />
            <circle cx="8" cy="8" r="1.4" />
            <circle cx="13" cy="8" r="1.4" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

/**
 * What can be done with one Play from the Playbooks page. A sheet from the
 * bottom on a phone, a small card on a desk; deleting asks once more,
 * because nothing brings a deleted Play back.
 */
function PlayActions({
  current,
  detail,
  member,
  onClose,
  onDelete,
  onOpen,
}: {
  current: boolean;
  detail?: string;
  member: PlaySearchProjection;
  onClose: () => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="play-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        aria-label={member.name}
        aria-modal="true"
        className="play-sheet"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          // The page's Escape goes back to the editor; here it only closes.
          event.stopPropagation();
          onClose();
        }}
        role="dialog"
      >
        <div className="play-sheet-head">
          <strong>
            {confirming ? `Delete “${member.name}”?` : member.name}
          </strong>
          {confirming ? (
            <span>{detail ?? "It will be removed from this Playbook."}</span>
          ) : (
            <PlayMeta member={member} />
          )}
        </div>
        {confirming ? (
          <div className="play-sheet-actions">
            <button
              autoFocus
              className="play-sheet-danger"
              onClick={onDelete}
              type="button"
            >
              Delete play
            </button>
            <button onClick={() => setConfirming(false)} type="button">
              Keep it
            </button>
          </div>
        ) : (
          <div className="play-sheet-actions">
            <button autoFocus onClick={onOpen} type="button">
              {current ? "Back to the editor" : "Open in editor"}
            </button>
            <button
              className="play-sheet-danger"
              onClick={() => setConfirming(true)}
              type="button"
            >
              Delete…
            </button>
            <button onClick={onClose} type="button">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
