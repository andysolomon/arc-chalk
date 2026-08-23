import {
  evaluatePlayAt,
  playDocumentFromPublished,
  planPlay,
  publicIdFromSharePath,
  secretFromLocationHash,
  type PlayAnimationPlan,
  type PlayAttachment,
  type PlayDocument,
  type ShareAccessOutcome,
  type SharePublication,
} from "@chalk/domain";
import {
  idlePlayback,
  pausePlayback,
  playPlayback,
  resetPlayback,
  seekPlayback,
  setPlaybackRate,
  tickPlayback,
  type PlaybackClock,
  type PlaybackRate,
} from "@chalk/editor";
import {
  buildRenderScene,
  buildSvgRenderScene,
  createSvgProjection,
  defaultPresentation,
  projectCoordinate,
} from "@chalk/render";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FieldDiagram } from "../components/field-diagram";
import { PlaybackBar } from "../components/playback-bar";
import { applyLiveFieldPaint } from "../components/live-field-paint";
import { readPlaybackNow } from "../components/playback-now";
import { openShareFromLocation, type ShareOpenResult } from "./share-location";

function outcomeCopy(outcome: ShareAccessOutcome): string {
  switch (outcome) {
    case "granted":
      return "";
    case "revoked":
      return "This Share Link has been revoked.";
    case "expired":
      return "This Share Link has expired.";
    case "invalid-secret":
    case "not-found":
      return "This Share Link is not valid.";
  }
}

export function ShareApp({
  loadAttachment,
  openShare,
}: {
  readonly loadAttachment?: (input: {
    publicId: string;
    secret: string;
    hash: string;
  }) => Promise<string | undefined>;
  readonly openShare: (input: {
    publicId: string;
    secret: string;
  }) => Promise<ShareOpenResult>;
}) {
  const [state, setState] = useState<
    | { phase: "loading" }
    | { phase: "message"; message: string }
    | {
        phase: "ready";
        publication: SharePublication;
        index: number;
        publicId: string;
        secret: string;
      }
  >({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    const publicId = publicIdFromSharePath(window.location.pathname);
    const secret = secretFromLocationHash(window.location.hash);
    void openShareFromLocation(openShare).then((result) => {
      if (cancelled) return;
      if ("status" in result) {
        setState({
          phase: "message",
          message:
            result.status === "missing-secret"
              ? "This Share Link needs its full address, including the part after #. Anyone with the complete link can view the publication."
              : "This Share Link is not valid.",
        });
        return;
      }
      if (result.outcome !== "granted" || !result.publication) {
        setState({
          phase: "message",
          message: outcomeCopy(result.outcome),
        });
        return;
      }
      if (!publicId || !secret) {
        setState({
          phase: "message",
          message: outcomeCopy("not-found"),
        });
        return;
      }
      setState({
        phase: "ready",
        publication: result.publication,
        index: 0,
        publicId,
        secret,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [openShare]);

  if (state.phase === "loading") {
    return (
      <main aria-busy="true" className="share-shell">
        <p>Opening the publication…</p>
      </main>
    );
  }
  if (state.phase === "message") {
    return (
      <main className="share-shell" role="alert">
        <p>{state.message}</p>
      </main>
    );
  }

  return (
    <SharePresentation
      key={`${state.publicId}:${state.index}`}
      index={state.index}
      loadAttachment={
        loadAttachment
          ? (hash) =>
              loadAttachment({
                publicId: state.publicId,
                secret: state.secret,
                hash,
              })
          : undefined
      }
      onIndex={(index) => setState({ ...state, index })}
      publication={state.publication}
    />
  );
}

function SharePresentation({
  index,
  loadAttachment,
  onIndex,
  publication,
}: {
  readonly index: number;
  readonly loadAttachment?: (hash: string) => Promise<string | undefined>;
  readonly onIndex: (index: number) => void;
  readonly publication: SharePublication;
}) {
  const entry = publication.entries[index] ?? publication.entries[0]!;
  const play = useMemo(
    () => playDocumentFromPublished(entry.play),
    [entry.play],
  );
  const plan = useMemo(() => planPlay(play), [play]);
  const scene = useMemo(
    () =>
      buildSvgRenderScene(
        buildRenderScene(play, {
          presentation: {
            ...defaultPresentation,
            present: true,
            pageKind:
              publication.presentation.fieldStyle === "blank"
                ? "blank"
                : "full",
          },
        }),
      ),
    [play, publication.presentation.fieldStyle],
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const clockRef = useRef<PlaybackClock>(idlePlayback(plan.startMs));
  const [clock, setClock] = useState<PlaybackClock>(() =>
    idlePlayback(plan.startMs),
  );
  const reducedMotion =
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const bounds = useMemo(
    () => ({ startMs: plan.startMs, endMs: plan.endMs }),
    [plan.startMs, plan.endMs],
  );

  const paint = useCallback(
    (next: PlaybackClock) => {
      const svg = svgRef.current;
      if (svg) paintSharePlayback(svg, play, next.timeMs, plan);
    },
    [play, plan],
  );

  useEffect(() => {
    if (!clock.playing) return;
    let frame = 0;
    const loop = (now: number) => {
      const next = tickPlayback(clockRef.current, now, bounds);
      clockRef.current = next;
      paint(next);
      if (!next.playing) {
        setClock(next);
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [clock.playing, bounds, paint]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === " ") {
        event.preventDefault();
        setClock((current) => {
          const next = current.playing
            ? pausePlayback(current)
            : playPlayback(current, readPlaybackNow(), bounds, {
                reducedMotion,
              });
          clockRef.current = next;
          return next;
        });
      } else if (event.key === "ArrowRight") {
        onIndex(Math.min(publication.entries.length - 1, index + 1));
      } else if (event.key === "ArrowLeft") {
        onIndex(Math.max(0, index - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bounds, index, onIndex, publication.entries.length, reducedMotion]);

  const timeline =
    publication.presentation.playback && plan.items.length > 0 ? (
      <PlaybackBar
        clock={clock}
        onPlay={() =>
          setClock((current) => {
            const next = current.playing
              ? pausePlayback(current)
              : playPlayback(current, readPlaybackNow(), bounds, {
                  reducedMotion,
                });
            clockRef.current = next;
            return next;
          })
        }
        onRate={(rate: PlaybackRate) =>
          setClock((current) => {
            const next = setPlaybackRate(current, rate, readPlaybackNow());
            clockRef.current = next;
            return next;
          })
        }
        onReset={() => {
          const next = resetPlayback(clockRef.current, bounds.startMs);
          clockRef.current = next;
          setClock(next);
        }}
        onSeek={(timeMs) =>
          setClock((current) => {
            const next = seekPlayback(current, timeMs, bounds);
            clockRef.current = next;
            return next;
          })
        }
        plan={plan}
      />
    ) : null;

  return (
    <div
      aria-label="Share Link"
      className="present-mode share-shell"
      role="region"
    >
      <div className="present-stage">
        <FieldDiagram scene={scene} svgRef={svgRef} />
      </div>
      {timeline}
      <div className="present-bar">
        <div className="present-name">{entry.play.name}</div>
        <div className="present-pos">
          {index + 1} / {publication.entries.length} · {publication.title}
        </div>
        <div className="share-film">
          {(entry.play.attachments ?? []).map((attachment) => (
            <ShareAttachment
              attachment={attachment}
              key={attachment.id}
              load={loadAttachment}
            />
          ))}
          {(entry.play.filmReferences ?? []).map((film) => (
            <a
              href={film.url}
              key={film.id}
              rel="noopener noreferrer nofollow"
              referrerPolicy="no-referrer"
              target="_blank"
            >
              {film.label ?? "Film Reference"}
            </a>
          ))}
        </div>
        <p className="share-warning">
          Anyone with this link can view the publication.
        </p>
      </div>
    </div>
  );
}

function paintSharePlayback(
  svg: SVGSVGElement,
  play: PlayDocument,
  timeMs: number,
  plan: PlayAnimationPlan,
): void {
  const frame = evaluatePlayAt(play, timeMs, plan);
  const projection = createSvgProjection(play.fieldProfile);
  applyLiveFieldPaint(svg, {
    playback: {
      players: play.players.map((player) => {
        const position = frame.playerPositions[player.id] ?? player.position;
        const point = projectCoordinate(position, projection);
        return { id: player.id, x: point.x, y: point.y };
      }),
      trails: frame.trails.map((trail) => ({
        pathId: `${trail.pathId}-trail`,
        d: trail.points
          .map((point, index) => {
            const projected = projectCoordinate(point, projection);
            return `${index === 0 ? "M" : "L"} ${projected.x.toFixed(1)} ${projected.y.toFixed(1)}`;
          })
          .join(" "),
      })),
    },
  });
  svg.setAttribute("data-playback-time", String(timeMs));
}

function ShareAttachment({
  attachment,
  load,
}: {
  readonly attachment: PlayAttachment;
  readonly load?: (hash: string) => Promise<string | undefined>;
}) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!load) return;
    let cancelled = false;
    void load(attachment.hash).then((next) => {
      if (!cancelled) setUrl(next);
    });
    return () => {
      cancelled = true;
    };
  }, [attachment.hash, load]);
  return (
    <figure className="share-attachment">
      {url ? (
        <img
          alt={attachment.caption ?? "Attached image"}
          referrerPolicy="no-referrer"
          src={url}
        />
      ) : null}
      <figcaption>{attachment.caption ?? "Attached image"}</figcaption>
    </figure>
  );
}
