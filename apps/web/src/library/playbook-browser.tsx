import type { PlayUnit } from "@chalk/domain";
import type { PlaySearchProjection } from "@chalk/local-db";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ChalkLibrary, LibraryBrowserState } from "../app/editor-runtime";
import {
  createPlaySearchClient,
  projectionsForHits,
} from "./play-search-client";
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
}[] = [
  { id: "all", name: "All" },
  { id: "offense", name: "Offense" },
  { id: "defense", name: "Defense" },
  { id: "special-teams", name: "Special" },
];

export function PlaybookBrowser({
  currentPlayId,
  initial,
  library,
  members,
  onClose,
  onOpen,
  onRemember,
}: {
  currentPlayId: string;
  initial: LibraryBrowserState;
  library: ChalkLibrary;
  members: readonly PlaySearchProjection[];
  onClose: () => void;
  onOpen: (playId: string) => void;
  onRemember: (state: LibraryBrowserState) => void;
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

  const playTypes = useMemo(() => {
    const names = new Set(
      members.flatMap((member) =>
        member.playTypeName ? [member.playTypeName] : [],
      ),
    );
    return [...names].sort();
  }, [members]);

  const scoped = useMemo(
    () =>
      members.filter(
        (member) =>
          (unit === "all" || member.unit === unit) &&
          (playType === "all" || member.playTypeName === playType),
      ),
    [members, playType, unit],
  );

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
      className="overlay browser-overlay"
      onClick={() => {
        remember();
        onClose();
      }}
      role="presentation"
    >
      <div
        aria-label="Playbook"
        className="browser playbook-browser"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
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
        <div className="browser-filter">
          <span>Unit</span>
          <div className="chip-row">
            {UNITS.map((choice) => (
              <button
                className={unit === choice.id ? "active" : undefined}
                key={choice.id}
                onClick={() => setUnit(choice.id)}
                type="button"
              >
                {choice.name}
              </button>
            ))}
          </div>
        </div>
        {playTypes.length > 0 ? (
          <div className="browser-filter">
            <span>Type</span>
            <div className="chip-row">
              <button
                className={playType === "all" ? "active" : undefined}
                onClick={() => setPlayType("all")}
                type="button"
              >
                All
              </button>
              {playTypes.map((name) => (
                <button
                  className={playType === name ? "active" : undefined}
                  key={name}
                  onClick={() => setPlayType(name)}
                  type="button"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
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
        {member.playTypeName ?? member.unit}
        {member.tags[0] ? ` · ${member.tags[0]}` : ""}
      </span>
    </button>
  );
}
