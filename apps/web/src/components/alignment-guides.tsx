import {
  MAX_BACKS,
  MIN_ON_THE_LINE,
  PLAYERS_PER_SIDE,
  type PlayDocument,
  type ScrimmageLine,
} from "@chalk/domain";
import type { AxisSnapGuide, FieldInteractionModel } from "@chalk/editor";
import { projectCoordinate, type SvgProjection } from "@chalk/render";
import { useSyncExternalStore } from "react";

import { SELECTION_BLUE } from "./field-marks";
import { liveScrimmageLine } from "./line-count";

/**
 * What a drag lines a man up with, drawn the way a design tool draws it
 * (ADR 0073): a field landmark is a guide across the field, as the original
 * drew it; a teammate is a short line through the men it lines up, each one
 * marked with a cross; an even split is the matching spaces measured under
 * the row. The count of men on the line rides beside the field.
 */

/** Half the arm of a member's cross. */
const CROSS_PX = 3.5;
/** How far an alignment line runs past the last man on it. */
const OVERHANG_PX = 14;
/** A split is measured edge to edge, in the space between two men's marks. */
const MARK_EDGE_PX = 13;
const SPAN_TICK_PX = 4;
/** The dragged man's own split is numbered under the row, clear of the marks. */
const SPAN_NUMBER_DROP_PX = 23;

const guideText = {
  fill: SELECTION_BLUE,
  fontFamily: "'Geist Mono', monospace",
  fontSize: 10.5,
} as const;

function formatSplit(yards: number): string {
  return `${Math.round(yards * 10) / 10} yd`;
}

function Cross({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M ${x - CROSS_PX} ${y - CROSS_PX} L ${x + CROSS_PX} ${y + CROSS_PX} M ${x - CROSS_PX} ${y + CROSS_PX} L ${x + CROSS_PX} ${y - CROSS_PX}`}
      data-guide-member=""
      stroke={SELECTION_BLUE}
      strokeLinecap="round"
      strokeWidth={1.5}
    />
  );
}

/** The guide's word, where the original put it: top for across, left for depth. */
function GuideLabel({
  guide,
  projection,
}: {
  guide: AxisSnapGuide;
  projection: SvgProjection;
}) {
  if (guide.axis === "lateral") {
    const x = projectCoordinate(
      { lateralYards: guide.valueYards, depthYards: 0 },
      projection,
    ).x;
    return (
      <text {...guideText} x={x + 6} y={24}>
        {guide.label}
      </text>
    );
  }
  const y = projectCoordinate(
    { lateralYards: 0, depthYards: guide.valueYards },
    projection,
  ).y;
  return (
    <text {...guideText} x={20} y={y - 7}>
      {guide.label}
    </text>
  );
}

/** A guide across the whole field, as the original drew its landmarks. */
function FieldGuideLine({
  guide,
  projection,
}: {
  guide: AxisSnapGuide;
  projection: SvgProjection;
}) {
  if (guide.axis === "lateral") {
    const x = projectCoordinate(
      { lateralYards: guide.valueYards, depthYards: 0 },
      projection,
    ).x;
    return (
      <line
        opacity={0.65}
        stroke={SELECTION_BLUE}
        strokeDasharray="5 4"
        strokeWidth={1}
        x1={x}
        x2={x}
        y1={6}
        y2={projection.height - 6}
      />
    );
  }
  const y = projectCoordinate(
    { lateralYards: 0, depthYards: guide.valueYards },
    projection,
  ).y;
  return (
    <line
      opacity={0.65}
      stroke={SELECTION_BLUE}
      strokeDasharray="5 4"
      strokeWidth={guide.strong ? 1.4 : 1}
      x1={projection.fieldInsetX}
      x2={projection.width - projection.fieldInsetX}
      y1={y}
      y2={y}
    />
  );
}

export function SnapGuideMark({
  guide,
  projection,
}: {
  guide: AxisSnapGuide;
  projection: SvgProjection;
}) {
  const members = (guide.members ?? []).map((member) =>
    projectCoordinate(member, projection),
  );
  const tags = {
    "data-snap-guide": guide.axis,
    "data-snap-source": guide.source,
    "data-snap-label": guide.label,
  };

  if (guide.spans && guide.spans.length > 0) {
    // The dragged man stands on the guide's own value; his split carries the
    // number, the matching ones only the bar, so the row is not lettered over.
    const own = (span: (typeof guide.spans)[number]) =>
      [span.from, span.to].some(
        (end) => Math.abs(end.lateralYards - guide.valueYards) < 1e-6,
      );
    return (
      <g {...tags}>
        {guide.spans.map((span, index) => {
          const from = projectCoordinate(span.from, projection);
          const to = projectCoordinate(span.to, projection);
          const y = (from.y + to.y) / 2;
          const inset = to.x - from.x > MARK_EDGE_PX * 2 + 4 ? MARK_EDGE_PX : 0;
          const left = from.x + inset;
          const right = to.x - inset;
          return (
            <g data-guide-span="" key={index}>
              <path
                d={`M ${left} ${y - SPAN_TICK_PX} V ${y + SPAN_TICK_PX} M ${left} ${y} H ${right} M ${right} ${y - SPAN_TICK_PX} V ${y + SPAN_TICK_PX}`}
                fill="none"
                stroke={SELECTION_BLUE}
                strokeWidth={1.25}
              />
              {guide.spacingYards === undefined || !own(span) ? null : (
                <text
                  {...guideText}
                  data-guide-split=""
                  fontSize={9.5}
                  textAnchor="middle"
                  x={(from.x + to.x) / 2}
                  y={Math.max(from.y, to.y) + SPAN_NUMBER_DROP_PX}
                >
                  {formatSplit(guide.spacingYards)}
                </text>
              )}
            </g>
          );
        })}
        <GuideLabel guide={guide} projection={projection} />
      </g>
    );
  }

  if (guide.source === "alignment" && members.length > 1) {
    const along = members.map((member) =>
      guide.axis === "lateral" ? member.y : member.x,
    );
    const first = Math.min(...along) - OVERHANG_PX;
    const last = Math.max(...along) + OVERHANG_PX;
    const at = guide.axis === "lateral" ? members[0]!.x : members[0]!.y;
    return (
      <g {...tags}>
        <line
          stroke={SELECTION_BLUE}
          strokeWidth={1}
          {...(guide.axis === "lateral"
            ? { x1: at, x2: at, y1: first, y2: last }
            : { x1: first, x2: last, y1: at, y2: at })}
        />
        {members.map((member, index) => (
          <Cross key={index} x={member.x} y={member.y} />
        ))}
        <GuideLabel guide={guide} projection={projection} />
      </g>
    );
  }

  return (
    <g {...tags}>
      <FieldGuideLine guide={guide} projection={projection} />
      {members.map((member, index) => (
        <Cross key={index} x={member.x} y={member.y} />
      ))}
      <GuideLabel guide={guide} projection={projection} />
    </g>
  );
}

const RULE =
  "No level — NFL, college or high school — allows more than four backs; with eleven on offense that is at least seven on the line. A man is on the line when he stands level with the snapper.";

function countWords(line: ScrimmageLine): string {
  const backs = line.backs.length;
  return `${line.onTheLine.length} on the line · ${backs} ${backs === 1 ? "back" : "backs"}`;
}

/**
 * How many of the offense are on the line. It shows while a man of the
 * offense is being moved, so the Coach sees a receiver come off the line as
 * he drags him, and stays while the formation is illegal. A legal set at rest
 * says nothing over the field; the status bar carries its count.
 */
export function LineCountChip({
  document,
  offenseShown,
  store,
}: {
  document: PlayDocument;
  offenseShown: boolean;
  store: {
    readonly subscribe: (listener: () => void) => () => void;
    readonly getSnapshot: () => FieldInteractionModel;
  };
}) {
  const model = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  if (!offenseShown) return null;
  const line = liveScrimmageLine(document, model.gesture);
  if (!line) return null;
  const gesture = model.gesture;
  const movingOffense =
    gesture.kind === "moving" &&
    gesture.items.some(
      (item) =>
        item.kind === "player" &&
        document.players.some(
          (player) => player.id === item.id && player.unit !== "defense",
        ),
    );
  if (line.legal && !movingOffense) return null;
  return (
    <div
      className="line-count"
      data-line-count={line.legal ? "legal" : "illegal"}
      role="status"
      title={RULE}
    >
      <strong>{countWords(line)}</strong>
      {line.legal ? null : (
        <span>
          {line.offenseCount === PLAYERS_PER_SIDE
            ? `Illegal formation — needs ${MIN_ON_THE_LINE} on the line`
            : `Illegal formation — no more than ${MAX_BACKS} backs`}
        </span>
      )}
    </div>
  );
}
