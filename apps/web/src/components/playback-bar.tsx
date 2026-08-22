import {
  formatPlaybackClock,
  formatPlaybackDuration,
  type PlayAnimationPlan,
} from "@chalk/domain";
import {
  PLAYBACK_RATES,
  type PlaybackClock,
  type PlaybackRate,
} from "@chalk/editor";
import type { PointerEvent } from "react";

export function PlaybackBar({
  clock,
  onPlay,
  onRate,
  onReset,
  onSeek,
  plan,
}: {
  readonly clock: PlaybackClock;
  readonly onPlay: () => void;
  readonly onRate: (rate: PlaybackRate) => void;
  readonly onReset: () => void;
  readonly onSeek: (timeMs: number) => void;
  readonly plan: PlayAnimationPlan;
}) {
  const span = Math.max(1, plan.endMs - plan.startMs);
  const progress = Math.min(
    1,
    Math.max(0, (clock.timeMs - plan.startMs) / span),
  );
  const snap = plan.hasMotion
    ? Math.min(1, Math.max(0, (0 - plan.startMs) / span))
    : undefined;

  const seekFromEvent = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width) return;
    const ratio = Math.max(
      0,
      Math.min(1, (event.clientX - box.left) / box.width),
    );
    onSeek(Math.round(plan.startMs + ratio * span));
  };

  return (
    <div
      aria-label="Playback controls"
      className="timeline"
      data-playback-playing={clock.playing ? "true" : "false"}
      data-playback-rate={clock.rate}
      data-playback-time={clock.timeMs}
    >
      <button
        aria-label={clock.playing ? "Pause" : "Play"}
        onClick={onPlay}
        title={clock.playing ? "Pause — space" : "Play — space"}
        type="button"
      >
        {clock.playing ? "❚❚" : "▶"}
      </button>
      <div
        aria-label="Scrub the play"
        aria-valuemax={plan.endMs}
        aria-valuemin={plan.startMs}
        aria-valuenow={clock.timeMs}
        className="scrubber"
        onPointerCancel={() => undefined}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          seekFromEvent(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            seekFromEvent(event);
          }
        }}
        role="slider"
      >
        <span className="scrubber-track" />
        <span
          className="scrubber-fill"
          style={{ width: `${progress * 100}%` }}
        />
        {snap === undefined ? null : (
          <span
            className="scrubber-snap"
            data-snap-tick=""
            style={{ left: `${snap * 100}%` }}
            title="The snap"
          />
        )}
        <i style={{ left: `calc(${progress * 100}% - 6px)` }} />
      </div>
      <code>
        {formatPlaybackClock(clock.timeMs)} /{" "}
        {formatPlaybackDuration(plan.endMs)}
      </code>
      <span className="speed">
        {PLAYBACK_RATES.map((rate) => (
          <button
            aria-pressed={clock.rate === rate}
            className={clock.rate === rate ? "active" : undefined}
            key={rate}
            onClick={() => onRate(rate)}
            type="button"
          >
            {rate === 0.5 ? "0.5×" : rate === 1 ? "1×" : "2×"}
          </button>
        ))}
      </span>
      <button
        aria-label="Reset"
        onClick={onReset}
        title="Back to the snap"
        type="button"
      >
        ⟲
      </button>
    </div>
  );
}
