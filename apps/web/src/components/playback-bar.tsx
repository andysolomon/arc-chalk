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

const rateLabel = (rate: PlaybackRate) =>
  rate === 0.5 ? "0.5×" : rate === 1 ? "1×" : "2×";

export function PlaybackBar({
  clock,
  compact = false,
  onPlay,
  onRate,
  onReset,
  onSeek,
  plan,
}: {
  readonly clock: PlaybackClock;
  /**
   * A phone's row (issue #98): the clock reads the elapsed time alone and
   * the speed is one button that steps through the rates, so the scrubber
   * keeps enough of the width to drag.
   */
  readonly compact?: boolean;
  readonly onPlay: () => void;
  readonly onRate: (rate: PlaybackRate) => void;
  readonly onReset: () => void;
  readonly onSeek: (timeMs: number) => void;
  readonly plan: PlayAnimationPlan;
}) {
  const span = Math.max(1, plan.endMs - plan.startMs);
  const nextRate =
    PLAYBACK_RATES[
      (PLAYBACK_RATES.indexOf(clock.rate) + 1) % PLAYBACK_RATES.length
    ] ?? PLAYBACK_RATES[0];
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
      data-playback-compact={compact ? "true" : undefined}
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
        aria-valuetext={`${(clock.timeMs / 1000).toFixed(1)} seconds${clock.timeMs < 0 ? " (before the snap)" : ""}`}
        className="scrubber"
        tabIndex={0}
        onKeyDown={(event) => {
          const targets: Record<string, number> = {
            ArrowRight: clock.timeMs + 100,
            ArrowUp: clock.timeMs + 100,
            ArrowLeft: clock.timeMs - 100,
            ArrowDown: clock.timeMs - 100,
            PageUp: clock.timeMs + 1000,
            PageDown: clock.timeMs - 1000,
            Home: plan.startMs,
            End: plan.endMs,
          };
          const target = targets[event.key];
          if (target === undefined) return;
          event.preventDefault();
          event.stopPropagation();
          onSeek(Math.min(plan.endMs, Math.max(plan.startMs, target)));
        }}
        onPointerCancel={() => undefined}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus();
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
      <code data-clock={compact ? "elapsed" : "full"}>
        {compact
          ? formatPlaybackClock(clock.timeMs)
          : `${formatPlaybackClock(clock.timeMs)} / ${formatPlaybackDuration(plan.endMs)}`}
      </code>
      <span className="speed">
        {compact ? (
          <button
            aria-label={`Speed ${rateLabel(clock.rate)} — next ${rateLabel(nextRate)}`}
            className="active"
            onClick={() => onRate(nextRate)}
            title={`Speed ${rateLabel(clock.rate)} — tap for ${rateLabel(nextRate)}`}
            type="button"
          >
            {rateLabel(clock.rate)}
          </button>
        ) : (
          PLAYBACK_RATES.map((rate) => (
            <button
              aria-pressed={clock.rate === rate}
              className={clock.rate === rate ? "active" : undefined}
              key={rate}
              onClick={() => onRate(rate)}
              type="button"
            >
              {rateLabel(rate)}
            </button>
          ))
        )}
      </span>
      <button
        aria-label="Reset positions"
        onClick={onReset}
        title="Back to the snap"
        type="button"
      >
        ⟲
      </button>
    </div>
  );
}
