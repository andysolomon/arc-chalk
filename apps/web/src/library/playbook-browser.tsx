import {
  UNCLASSIFIED_PLAY_TYPE_NAME,
  CLASSIFICATION_SEPARATOR,
  movePlayInOrder,
  playUnits,
  type Concept,
  type Formation,
  type PlayTypeDefinition,
  type PlayUnit,
} from "@chalk/domain";
import type { PlaySearchProjection, PlaybookSummary } from "@chalk/local-db";
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";

import type {
  ChalkLibrary,
  LibraryBrowserState,
  PlaybookLayout,
  PlaybookSort,
} from "../app/editor-runtime";
import { UnitBadge } from "../components/unit-badge";
import { ANY, FilterChip } from "./filter-chip";
import {
  emptyPlayFilters,
  matchesPlayFilters,
  playFacets,
  playFilterChoices,
  playFiltersNarrow,
  type PlayFilterValues,
} from "./play-filters";
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

/**
 * Which filters the browser offers. The dialog over the editor keeps its one
 * row of toggle chips; a Playbook's own page adds the set and personnel a
 * Play stands in; the Plays page, which reads across every book, adds the
 * book, the family of sets, and an Advanced row for what else a Play records.
 */
export type PlaybookFilters = "compact" | "book" | "library";

/**
 * Where a list starts on the page, and how tall the header pinned over the
 * page's top is — what a list virtualized against the window needs.
 */
function pageOffsetsOf(list: HTMLElement | null): {
  readonly margin: number;
  readonly header: number;
} {
  if (!list) return { margin: 0, header: 0 };
  const header = list.ownerDocument.querySelector(".topbar");
  return {
    margin: Math.round(list.getBoundingClientRect().top + globalThis.scrollY),
    header: Math.round(header?.getBoundingClientRect().height ?? 0),
  };
}

export function PlaybookBrowser({
  concepts = [],
  currentPlayId,
  deletable = () => true,
  deletePrompt,
  embedded = false,
  filters = "compact",
  focusSearch = true,
  formations = [],
  initial,
  initialFilters,
  layoutChoice = false,
  library,
  members,
  onClose,
  onDelete,
  onOpen,
  onOpenGamePlans,
  onRemember,
  onReorder,
  onStartPlay,
  onTransfer,
  pageScroll = false,
  playbooks = [],
  playOrder,
  playTypes,
}: {
  /** The Concepts of the book, for the Advanced row's Concept filter. */
  concepts?: readonly Concept[];
  currentPlayId: string;
  /** Whether this Play can be deleted from here; a Play of another book cannot. */
  deletable?: (member: PlaySearchProjection) => boolean;
  /** What deleting this Play also does, said before the Coach confirms. */
  deletePrompt?: (playId: string) => string;
  filters?: PlaybookFilters;
  /** Every set a Play could stand in, shipped and saved, for the set filters. */
  formations?: readonly Formation[];
  /** Filters already set when the browser opens — the set a Coach came from. */
  initialFilters?: Partial<PlayFilterValues>;
  /** Whether the Coach chooses cards or a list; otherwise the screen decides. */
  layoutChoice?: boolean;
  /** The books on this device, for the Playbook filter. */
  playbooks?: readonly PlaybookSummary[];
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
  /**
   * Saves the book's install order (issue #166). Offered on a book's own
   * page, where Sort reads Install order and a Play is dragged into place.
   */
  onReorder?: (order: readonly string[]) => void;
  /** An empty book offers its first Play of either side (issue #166). */
  onStartPlay?: (unit: PlayUnit) => void;
  /** Copies or moves a Play into another book (issue #166). */
  onTransfer?: (
    playId: string,
    playbookId: string,
    mode: "copy" | "move",
  ) => void;
  /** The install order the book keeps, read with Sort on Install order. */
  playOrder?: readonly string[];
  /**
   * The page scrolls rather than the list inside it — a phone, where the
   * browser folds its toolbar away only when the document moves. The list
   * is still virtualized, against the window.
   */
  pageScroll?: boolean;
  playTypes: readonly PlayTypeDefinition[];
}) {
  const [query, setQuery] = useState(initial.query);
  const [values, setValues] = useState<PlayFilterValues>(() => ({
    ...emptyPlayFilters,
    ...initialFilters,
  }));
  const { unit, playType } = values;
  const setUnit = (next: "all" | PlayUnit) =>
    setValues((current) => ({ ...current, unit: next }));
  const setPlayType = (next: string) =>
    setValues((current) => ({ ...current, playType: next }));
  const setValue = <K extends keyof PlayFilterValues>(
    key: K,
    next: PlayFilterValues[K],
  ) => setValues((current) => ({ ...current, [key]: next }));
  const advancedSet =
    values.conceptId !== ANY || values.tag !== ANY || values.motion !== ANY;
  const [advancedOpen, setAdvancedOpen] = useState(advancedSet);
  const [chosenSort, setSort] = useState<PlaybookSort>(initial.sort ?? "name");
  // The install order belongs to one book, so it is read only on a book's
  // own page; elsewhere a remembered Install order reads by name.
  const sort: PlaybookSort =
    chosenSort === "order" && !onReorder ? "name" : chosenSort;
  // Held here too, so a Play dropped into place stays there while the book
  // saves the new order.
  const [order, setOrder] = useState(playOrder);
  const [orderSeen, setOrderSeen] = useState(playOrder);
  if (orderSeen !== playOrder) {
    setOrderSeen(playOrder);
    setOrder(playOrder);
  }
  const [dragging, setDragging] = useState<string>();
  const [dropAt, setDropAt] = useState<{
    readonly playId: string;
    readonly place: "before" | "after";
  }>();
  const [layout, setLayout] = useState<PlaybookLayout | undefined>(
    initial.layout,
  );
  const [hits, setHits] = useState<readonly PlaySearchProjection[]>(members);
  const [focusedPlayId, setFocusedPlayId] = useState(initial.focusedPlayId);
  const [actionsFor, setActionsFor] = useState<string>();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const narrow = useNarrowBrowser();
  // A phone lists by default and a desk tiles; where the Coach may choose,
  // his choice stands until he changes it.
  const shownLayout: PlaybookLayout = layoutChoice
    ? (layout ?? (narrow ? "list" : "grid"))
    : embedded && narrow
      ? "list"
      : "grid";
  const list = shownLayout === "list";
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
  const formationsById = useMemo(
    () => new Map(formations.map((formation) => [formation.id, formation])),
    [formations],
  );
  const choices = useMemo(
    () =>
      filters === "compact"
        ? undefined
        : playFilterChoices({
            concepts,
            formationsById,
            members,
            playbooks,
            playTypes,
            unit,
          }),
    [concepts, filters, formationsById, members, playbooks, playTypes, unit],
  );
  const pinnedFormation =
    values.formationId === ANY
      ? undefined
      : formationsById.get(values.formationId);

  const scoped = useMemo(
    () =>
      members.filter((member) =>
        matchesPlayFilters(member, values, formationsById),
      ),
    [formationsById, members, values],
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
    () => (searching ? hits : sortPlays(hits, sort, order)),
    [hits, order, searching, sort],
  );
  const reordering = onReorder !== undefined && sort === "order" && !searching;
  /**
   * Puts one Play before or after another. The order saved lists the whole
   * book, filtered or not, so a Play the filters hide keeps its place.
   */
  const placePlay = (
    playId: string,
    targetId: string,
    place: "before" | "after",
  ) => {
    if (!onReorder || playId === targetId) return;
    const whole = sortPlays(members, "order", order).map(
      (member) => member.playId,
    );
    const next = movePlayInOrder(whole, playId, targetId, place);
    setOrder(next);
    onReorder(next);
  };
  /** One step earlier or later among the Plays showing. */
  const stepPlay = (playId: string, step: -1 | 1) => {
    const at = shown.findIndex((member) => member.playId === playId);
    const target = shown[at + step];
    if (at < 0 || !target) return;
    placePlay(playId, target.playId, step < 0 ? "before" : "after");
  };
  const narrowed = searching || playFiltersNarrow(values);

  const rows = useMemo(() => {
    const grouped: PlaySearchProjection[][] = [];
    for (let index = 0; index < shown.length; index += columns) {
      grouped.push(shown.slice(index, index + columns));
    }
    return grouped;
  }, [columns, shown]);

  // Where the list starts on the page, and how much of the top a pinned
  // header covers, when the page is what scrolls. Read again whenever the
  // page changes size: a filter row opening above the list moves it down.
  const [pageOffsets, setPageOffsets] = useState({ margin: 0, header: 0 });
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!pageScroll || !list) return;
    const read = () =>
      setPageOffsets((current) => {
        const next = pageOffsetsOf(list);
        return next.margin === current.margin && next.header === current.header
          ? current
          : next;
      });
    read();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(read);
    observer.observe(list.ownerDocument.body);
    return () => observer.disconnect();
  }, [pageScroll]);

  // TanStack Virtual returns functions the compiler cannot memoize.
  // eslint-disable-next-line react-hooks/incompatible-library -- virtualizer API
  const listVirtualizer = useVirtualizer({
    count: rows.length,
    enabled: !pageScroll,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => rowHeight,
    overscan: 6,
  });
  const pageVirtualizer = useWindowVirtualizer({
    count: rows.length,
    enabled: pageScroll,
    estimateSize: () => rowHeight,
    overscan: 6,
    scrollMargin: pageOffsets.margin,
    scrollPaddingStart: pageOffsets.header,
  });
  const virtualizer = pageScroll ? pageVirtualizer : listVirtualizer;
  const scrollMargin = pageScroll ? pageOffsets.margin : 0;
  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, virtualizer]);

  /** How far down the list the Coach has scrolled, whichever box scrolls. */
  const listScrollTop = () =>
    pageScroll
      ? Math.max(
          0,
          Math.round(
            globalThis.scrollY - pageOffsetsOf(listRef.current).margin,
          ),
        )
      : (scrollerRef.current?.scrollTop ?? 0);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || restoredRef.current) return;
    restoredRef.current = true;
    if (pageScroll) {
      if (initial.scrollTop > 0) {
        globalThis.scrollTo(
          0,
          pageOffsetsOf(listRef.current).margin + initial.scrollTop,
        );
      }
    } else {
      node.scrollTop = initial.scrollTop;
    }
    if (initial.focusedPlayId) {
      const index = shown.findIndex(
        (member) => member.playId === initial.focusedPlayId,
      );
      if (index >= 0) {
        virtualizer.scrollToIndex(Math.floor(index / columns));
      }
    }
  }, [
    columns,
    shown,
    initial.focusedPlayId,
    initial.scrollTop,
    pageScroll,
    virtualizer,
  ]);

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
    next: {
      readonly sort?: PlaybookSort;
      readonly layout?: PlaybookLayout;
    } = {},
  ) => {
    const kept = next.layout ?? layout;
    onRemember({
      scrollTop: listScrollTop(),
      query,
      // What he chose, even where a page reads it by name: the install order
      // stays his choice for the book's own page.
      sort: next.sort ?? chosenSort,
      ...(kept ? { layout: kept } : {}),
      ...((playId ?? focusedPlayId)
        ? { focusedPlayId: playId ?? focusedPlayId }
        : {}),
    });
  };

  // The page's scroll is the list's when the page is what scrolls.
  const rememberRef = useRef(remember);
  useLayoutEffect(() => {
    rememberRef.current = remember;
  });
  useEffect(() => {
    if (!pageScroll) return;
    const onScroll = () => rememberRef.current();
    globalThis.addEventListener("scroll", onScroll, { passive: true });
    return () => globalThis.removeEventListener("scroll", onScroll);
  }, [pageScroll]);

  const chooseLayout = (next: PlaybookLayout) => {
    setLayout(next);
    remember(undefined, { layout: next });
  };

  const clearFilters = () => {
    setQuery("");
    setValues(emptyPlayFilters);
  };

  const open = (playId: string) => {
    remember(playId);
    onOpen(playId);
  };

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
          {/* The Unit is a row of switches: a lit chip narrows the book, and
              a second press opens it back up. In the dialog the Types are
              switches beside it; on a page each further axis is a chip that
              opens its choices, since a set list is too long for a row. */}
          <div
            aria-label="Filter plays"
            className={`playbook-filters${
              choices ? " playbook-filters-menus" : ""
            }`}
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
            {choices ? (
              <>
                <FilterChip
                  choices={choices.playTypes}
                  focusSearch={focusSearch}
                  label="Type"
                  onPick={(next) => setValue("playType", next)}
                  value={values.playType}
                />
                {filters === "library" ? (
                  <FilterChip
                    choices={choices.playbooks}
                    focusSearch={focusSearch}
                    label="Playbook"
                    onPick={(next) => setValue("playbookId", next)}
                    value={values.playbookId}
                  />
                ) : null}
                {pinnedFormation ? (
                  <button
                    aria-label={`Set: ${pinnedFormation.name}. Remove`}
                    className="chip active chip-pinned"
                    onClick={() => setValue("formationId", ANY)}
                    title="Only plays in this set — press to open the book back up"
                    type="button"
                  >
                    <span className="chip-text">{pinnedFormation.name}</span>
                    <span aria-hidden="true" className="chip-x">
                      ×
                    </span>
                  </button>
                ) : (
                  <>
                    <FilterChip
                      choices={choices.formationGroups}
                      focusSearch={focusSearch}
                      label="Formation"
                      onPick={(next) => setValue("formationGroup", next)}
                      value={values.formationGroup}
                    />
                    {filters === "library" ? (
                      <FilterChip
                        choices={choices.sets}
                        focusSearch={focusSearch}
                        label="Set"
                        onPick={(next) => setValue("set", next)}
                        value={values.set}
                      />
                    ) : null}
                  </>
                )}
                <FilterChip
                  choices={choices.personnel}
                  focusSearch={focusSearch}
                  label="Personnel"
                  onPick={(next) => setValue("personnel", next)}
                  value={values.personnel}
                />
                {filters === "library" ? (
                  <button
                    aria-controls="playbook-advanced"
                    aria-expanded={advancedOpen}
                    className={`chip chip-advanced${
                      advancedSet ? " active" : ""
                    }${advancedOpen ? " open" : ""}`}
                    onClick={() => setAdvancedOpen((open) => !open)}
                    title="Concept, tag and motion"
                    type="button"
                  >
                    <span className="chip-text">Advanced</span>
                    <svg
                      aria-hidden="true"
                      className="chip-caret"
                      viewBox="0 0 8 8"
                    >
                      <path d="M1.5 3 4 5.5 6.5 3" />
                    </svg>
                  </button>
                ) : null}
              </>
            ) : (
              <>
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
                    setPlayType(
                      playType === UNCLASSIFIED ? "all" : UNCLASSIFIED,
                    )
                  }
                  title="Plays left at their unit with no type chosen"
                  type="button"
                >
                  {UNCLASSIFIED_PLAY_TYPE_NAME}
                </button>
              </>
            )}
          </div>
          {choices && filters === "library" && advancedOpen ? (
            <div
              aria-label="More filters"
              className="playbook-filters playbook-filters-menus playbook-advanced"
              id="playbook-advanced"
              role="group"
            >
              <FilterChip
                choices={choices.concepts}
                focusSearch={focusSearch}
                label="Concept"
                onPick={(next) => setValue("conceptId", next)}
                value={values.conceptId}
              />
              <FilterChip
                choices={choices.tags}
                focusSearch={focusSearch}
                label="Tag"
                onPick={(next) => setValue("tag", next)}
                value={values.tag}
              />
              <FilterChip
                allName="Either"
                choices={choices.motion}
                focusSearch={focusSearch}
                label="Motion"
                onPick={(next) =>
                  setValue(
                    "motion",
                    next === "with" || next === "without" ? next : ANY,
                  )
                }
                value={values.motion}
              />
            </div>
          ) : null}
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
            {layoutChoice ? (
              <div aria-label="Layout" className="playbook-layout" role="group">
                <button
                  aria-label="Cards"
                  aria-pressed={!list}
                  className={list ? undefined : "active"}
                  onClick={() => chooseLayout("grid")}
                  title="Cards"
                  type="button"
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16">
                    <rect height="5" rx="1" width="5" x="2" y="2" />
                    <rect height="5" rx="1" width="5" x="9" y="2" />
                    <rect height="5" rx="1" width="5" x="2" y="9" />
                    <rect height="5" rx="1" width="5" x="9" y="9" />
                  </svg>
                </button>
                <button
                  aria-label="List"
                  aria-pressed={list}
                  className={list ? "active" : undefined}
                  onClick={() => chooseLayout("list")}
                  title="List"
                  type="button"
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16">
                    <rect height="2" rx="1" width="12" x="2" y="3" />
                    <rect height="2" rx="1" width="12" x="2" y="7" />
                    <rect height="2" rx="1" width="12" x="2" y="11" />
                  </svg>
                </button>
              </div>
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
                  {onReorder ? (
                    <option value="order">Install order</option>
                  ) : null}
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
          data-reordering={reordering ? "true" : undefined}
          data-virtual-count={shown.length}
          onScroll={pageScroll ? undefined : () => remember()}
          ref={scrollerRef}
        >
          <div
            ref={listRef}
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
                    transform: `translateY(${row.start - scrollMargin}px)`,
                  }}
                >
                  {cards.map((member) => (
                    <PlayItem
                      current={member.playId === currentPlayId}
                      drop={
                        dropAt?.playId === member.playId &&
                        dragging !== member.playId
                          ? dropAt.place
                          : undefined
                      }
                      focused={member.playId === focusedPlayId}
                      key={member.playId}
                      layout={list ? "list" : "grid"}
                      member={member}
                      reorder={
                        reordering
                          ? {
                              dragging,
                              onDragEnd: () => {
                                setDragging(undefined);
                                setDropAt(undefined);
                              },
                              onDragStart: () => setDragging(member.playId),
                              onDragOver: (place) =>
                                setDropAt((current) =>
                                  current?.playId === member.playId &&
                                  current.place === place
                                    ? current
                                    : { playId: member.playId, place },
                                ),
                              onDrop: (playId, place) => {
                                setDragging(undefined);
                                setDropAt(undefined);
                                placePlay(playId, member.playId, place);
                              },
                            }
                          : undefined
                      }
                      set={
                        choices
                          ? playFacets(member, formationsById).formation?.name
                          : undefined
                      }
                      onActions={
                        embedded &&
                        ((onDelete && deletable(member)) || onTransfer)
                          ? () => setActionsFor(member.playId)
                          : undefined
                      }
                      onFocus={() => setFocusedPlayId(member.playId)}
                      onOpen={() => open(member.playId)}
                      urlFor={thumbnails.urlFor}
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
                  ? "Start its first play on either side of the ball. Every play you draw is kept here."
                  : "Every play you draw is kept here."}
              </span>
              {embedded && onStartPlay ? (
                <div className="playbook-start">
                  <button onClick={() => onStartPlay("offense")} type="button">
                    New offensive play
                  </button>
                  <button onClick={() => onStartPlay("defense")} type="button">
                    New defensive play
                  </button>
                </div>
              ) : null}
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
      {actionsMember ? (
        <PlayActions
          current={actionsMember.playId === currentPlayId}
          destinations={
            onTransfer
              ? playbooks.filter(
                  ({ archivedAtMs, id }) =>
                    archivedAtMs === undefined &&
                    id !== actionsMember.playbookId,
                )
              : []
          }
          detail={deletePrompt?.(actionsMember.playId)}
          key={actionsMember.playId}
          member={actionsMember}
          onClose={() => setActionsFor(undefined)}
          onDelete={
            onDelete && deletable(actionsMember)
              ? () => {
                  setActionsFor(undefined);
                  onDelete(actionsMember.playId);
                }
              : undefined
          }
          onOpen={() => {
            setActionsFor(undefined);
            open(actionsMember.playId);
          }}
          onStep={
            reordering
              ? (step) => stepPlay(actionsMember.playId, step)
              : undefined
          }
          onTransfer={(playbookId, mode) => {
            setActionsFor(undefined);
            onTransfer?.(actionsMember.playId, playbookId, mode);
          }}
          place={
            reordering
              ? {
                  first: shown[0]?.playId === actionsMember.playId,
                  last: shown.at(-1)?.playId === actionsMember.playId,
                }
              : undefined
          }
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

function PlayMeta({
  member,
  set,
}: {
  member: PlaySearchProjection;
  /** The set the Play stands in, where the page knows it. */
  set?: string;
}) {
  const type =
    member.playTypeId === undefined
      ? undefined
      : (member.playTypeName ?? member.playTypeId);
  return (
    <span className="playbook-card-type">
      <UnitBadge unit={member.unit} />
      {type === undefined ? "" : `${CLASSIFICATION_SEPARATOR}${type}`}
      {set ? `${CLASSIFICATION_SEPARATOR}${set}` : ""}
      {member.tags[0] && !set
        ? `${CLASSIFICATION_SEPARATOR}${member.tags[0]}`
        : ""}
    </span>
  );
}

/**
 * One Play in the book. The frame holds the Play; the button inside it opens
 * the Play, and on the Playbooks page a second button beside it offers what
 * else can be done with it.
 */
/** What a card does while the book is in install order and cards drag. */
interface ReorderHandlers {
  readonly dragging?: string;
  readonly onDragStart: () => void;
  readonly onDragOver: (place: "before" | "after") => void;
  readonly onDrop: (playId: string, place: "before" | "after") => void;
  readonly onDragEnd: () => void;
}

const DRAGGED_PLAY = "application/x-chalk-play";

function PlayItem({
  current,
  drop,
  focused,
  layout,
  member,
  onActions,
  onFocus,
  onOpen,
  reorder,
  set,
  urlFor,
}: {
  current: boolean;
  /** Where a dragged Play would land beside this one. */
  drop?: "before" | "after";
  focused: boolean;
  layout: "grid" | "list";
  member: PlaySearchProjection;
  onActions?: () => void;
  onFocus: () => void;
  onOpen: () => void;
  reorder?: ReorderHandlers;
  set?: string;
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
  // A list stacks, so a Play lands above or below; cards run across a row.
  const placeFor = (event: DragEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return (
      layout === "list"
        ? event.clientY > box.top + box.height / 2
        : event.clientX > box.left + box.width / 2
    )
      ? ("after" as const)
      : ("before" as const);
  };

  return (
    <div
      className={`${frame}${current ? " current" : ""}${
        focused ? " focused" : ""
      }${reorder ? " reorderable" : ""}${
        reorder?.dragging === member.playId ? " dragging" : ""
      }${drop ? ` drop-${drop}` : ""}`}
      data-play-id={member.playId}
      draggable={reorder ? true : undefined}
      onDragEnd={reorder ? () => reorder.onDragEnd() : undefined}
      onDragOver={
        reorder
          ? (event) => {
              if (!event.dataTransfer.types.includes(DRAGGED_PLAY)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              reorder.onDragOver(placeFor(event));
            }
          : undefined
      }
      onDragStart={
        reorder
          ? (event) => {
              event.dataTransfer.setData(DRAGGED_PLAY, member.playId);
              event.dataTransfer.setData("text/plain", member.name);
              event.dataTransfer.effectAllowed = "move";
              reorder.onDragStart();
            }
          : undefined
      }
      onDrop={
        reorder
          ? (event) => {
              const playId = event.dataTransfer.getData(DRAGGED_PLAY);
              if (!playId) return;
              event.preventDefault();
              reorder.onDrop(playId, placeFor(event));
            }
          : undefined
      }
      title={reorder ? "Drag to put it in install order" : undefined}
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
            <PlayMeta member={member} set={set} />
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
          title="Open, copy, move or delete"
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
 * What can be done with one Play from the Playbooks page: open it, copy or
 * move it into another book (issue #166), step it earlier or later in the
 * install order, or delete it. A sheet from the bottom on a phone, a small
 * card on a desk; deleting asks once more, because nothing brings a deleted
 * Play back.
 */
function PlayActions({
  current,
  destinations,
  detail,
  member,
  onClose,
  onDelete,
  onOpen,
  onStep,
  onTransfer,
  place,
}: {
  current: boolean;
  /** The other books on the shelf a Play can be copied or moved into. */
  destinations: readonly PlaybookSummary[];
  detail?: string;
  member: PlaySearchProjection;
  onClose: () => void;
  /** Offered only for a Play of the open book. */
  onDelete?: () => void;
  onOpen: () => void;
  /** Offered while the book reads in install order. */
  onStep?: (step: -1 | 1) => void;
  onTransfer: (playbookId: string, mode: "copy" | "move") => void;
  place?: { readonly first: boolean; readonly last: boolean };
}) {
  const [step, setStep] = useState<"menu" | "delete" | "copy" | "move">("menu");
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
          if (step === "menu") onClose();
          else setStep("menu");
        }}
        role="dialog"
      >
        <div className="play-sheet-head">
          <strong>
            {step === "delete"
              ? `Delete “${member.name}”?`
              : step === "copy"
                ? `Copy “${member.name}” to…`
                : step === "move"
                  ? `Move “${member.name}” to…`
                  : member.name}
          </strong>
          {step === "delete" ? (
            <span>{detail ?? "It will be removed from this Playbook."}</span>
          ) : step === "copy" ? (
            <span>
              The copy keeps its type, concept and saved set; this one stays
              where it is.
            </span>
          ) : step === "move" ? (
            <span>
              It keeps its type, concept and saved set, and leaves this book.
            </span>
          ) : (
            <PlayMeta member={member} />
          )}
        </div>
        {step === "delete" && onDelete ? (
          <div className="play-sheet-actions">
            <button
              autoFocus
              className="play-sheet-danger"
              onClick={onDelete}
              type="button"
            >
              Delete play
            </button>
            <button onClick={() => setStep("menu")} type="button">
              Keep it
            </button>
          </div>
        ) : step === "copy" || step === "move" ? (
          <div
            aria-label={step === "copy" ? "Copy to" : "Move to"}
            className="play-sheet-actions"
            role="group"
          >
            {destinations.map((book, index) => (
              <button
                autoFocus={index === 0}
                className="play-sheet-book"
                key={book.id}
                onClick={() => onTransfer(book.id, step)}
                type="button"
              >
                <span>{book.name}</span>
                <span className="play-sheet-count">
                  {playCount(book.playCount)}
                </span>
              </button>
            ))}
            <button onClick={() => setStep("menu")} type="button">
              Back
            </button>
          </div>
        ) : (
          <div className="play-sheet-actions">
            <button autoFocus onClick={onOpen} type="button">
              {current ? "Back to the editor" : "Open in editor"}
            </button>
            {destinations.length > 0 ? (
              <>
                <button onClick={() => setStep("copy")} type="button">
                  Copy to…
                </button>
                <button onClick={() => setStep("move")} type="button">
                  Move to…
                </button>
              </>
            ) : null}
            {onStep && place ? (
              <div className="play-sheet-steps">
                <button
                  disabled={place.first}
                  onClick={() => onStep(-1)}
                  type="button"
                >
                  Move earlier
                </button>
                <button
                  disabled={place.last}
                  onClick={() => onStep(1)}
                  type="button"
                >
                  Move later
                </button>
              </div>
            ) : null}
            {onDelete ? (
              <button
                className="play-sheet-danger"
                onClick={() => setStep("delete")}
                type="button"
              >
                Delete…
              </button>
            ) : null}
            <button onClick={onClose} type="button">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
