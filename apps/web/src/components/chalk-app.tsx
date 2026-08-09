import {
  applyPlayCommand,
  createStableId,
  DEFAULT_ZONE_COVERAGE_RADII,
  labelRolePresets,
  labelSizeChoices,
  PRODUCT_NAME,
  stickThunderPlay,
  type LabelRole,
  type MovementPath,
  type PlayCommand,
  type TextLabel,
} from "@chalk/domain";
import {
  applyLabelRoleCommand,
  fieldInteraction,
  insertedEntityIds,
  gesturePreviewCommand,
  idleFieldInteraction,
  setLabelAppearanceCommand,
  setLabelTextCommand,
  localSaveMessage,
  localSaveStatus,
  pruneFieldSelection,
  type EditorUndoState,
  type EditorVersionSummary,
  type FieldDrawingState,
  type FieldGesture,
  lineOf,
  type FieldHandleRef,
  type FieldInteractionContext,
  type FieldInteractionEvent,
  type FieldInteractionModel,
  type LabelAppearance,
} from "@chalk/editor";
import {
  buildRenderScene,
  buildSvgRenderScene,
  projectCoordinate,
  unprojectPoint,
  type RenderScene,
  type SvgProjection,
  type SvgRenderScene,
  type SvgPathStroke,
  type SvgShapePrimitive,
  type SvgTextPrimitive,
} from "@chalk/render";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { ChalkRuntime } from "../app/editor-runtime";
import { type ActionMap } from "./editor-command-surface";
import {
  CommandPalette,
  ExportMenu,
  MoreMenu,
  SaveMenu,
  ShortcutReference,
} from "./editor-overlays";

type View = "Editor" | "Demo" | "Present" | "Print";
type Menu = "more" | "export" | "save" | null;
type Overlay = "palette" | "shortcuts" | null;
type Tool =
  "select" | "player" | "route" | "motion" | "block" | "zone" | "text";

const views: View[] = ["Editor", "Demo", "Present", "Print"];
const tools: Array<{
  id: Tool;
  label: string;
  shortcut: string;
  glyph: string;
}> = [
  { id: "select", label: "Select", shortcut: "V", glyph: "pointer" },
  { id: "player", label: "Player", shortcut: "P", glyph: "circle" },
  { id: "route", label: "Route", shortcut: "R", glyph: "route" },
  { id: "motion", label: "Motion", shortcut: "M", glyph: "motion" },
  { id: "block", label: "Block", shortcut: "B", glyph: "block" },
  { id: "zone", label: "Zone drop", shortcut: "Z", glyph: "zone" },
  { id: "text", label: "Text", shortcut: "T", glyph: "text" },
];

function ToolIcon({ glyph }: { glyph: string }) {
  if (glyph === "circle") return <span className="tool-circle" />;
  if (glyph === "text") return <span className="tool-text">T</span>;

  const paths: Record<string, React.ReactNode> = {
    pointer: <path d="m8 5 9 8-5 .7 2.8 5-2.8 1.5-2.7-5-3.3 3z" />,
    route: <path d="M6 18h5V8m0 0-3 3m3-3 3 3" />,
    motion: <path d="M5 12h12m0 0-4-4m4 4-4 4" strokeDasharray="2 2" />,
    block: <path d="M6 17 17 6m-3 0h3v3" />,
    zone: <path d="M6 17c4-1 3-7 8-8m0 0-3-1m3 1-1 3" strokeDasharray="2 2" />,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <g
        fill={glyph === "pointer" ? "currentColor" : "none"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      >
        {paths[glyph]}
      </g>
    </svg>
  );
}

const stickThunderScene = buildSvgRenderScene(
  buildRenderScene(stickThunderPlay),
);

const sceneColors = {
  ink: "#171717",
  blue: "#0072f5",
  red: "#E5484D",
  green: "#398E4A",
  orange: "#C2540A",
  gray: "#8F8F8F",
  yellow: "#F5D90A",
} as const;

const routeDashes: Record<SvgPathStroke["style"]["line"], string | undefined> =
  {
    solid: undefined,
    dashed: "8 6",
    dotted: "2 6",
    zigzag: undefined,
  };

function RoutePath({
  d,
  id,
  style,
}: {
  d: string;
  id: string;
  style: SvgPathStroke["style"];
}) {
  const markerEnd =
    style.ending === "none"
      ? undefined
      : `url(#chalk-${style.ending}-${style.color})`;

  return (
    <path
      d={d}
      data-scene-path={id}
      fill="none"
      markerEnd={markerEnd}
      stroke={sceneColors[style.color]}
      strokeDasharray={routeDashes[style.line]}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.5"
    />
  );
}

function SceneShape({ shape }: { shape: SvgShapePrimitive }) {
  switch (shape.kind) {
    case "circle":
      return (
        <circle
          cx={shape.cx}
          cy={shape.cy}
          fill={shape.fill}
          r={shape.r}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
        />
      );
    case "rect":
      return (
        <rect
          fill={shape.fill}
          height={shape.height}
          rx={shape.rx}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          width={shape.width}
          x={shape.x}
          y={shape.y}
        />
      );
    case "ellipse":
      return (
        <ellipse
          cx={shape.cx}
          cy={shape.cy}
          fill={shape.fill}
          rx={shape.rx}
          ry={shape.ry}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
        />
      );
    case "path":
      return (
        <path
          d={shape.d}
          fill={shape.fill}
          stroke={shape.stroke}
          strokeLinecap={shape.strokeLinecap}
          strokeLinejoin={shape.strokeLinejoin}
          strokeWidth={shape.strokeWidth}
        />
      );
  }
}

function SceneText({ text }: { text: SvgTextPrimitive }) {
  return (
    <text {...text} textAnchor="middle">
      {text.text}
    </text>
  );
}

/** The original's selection blue, used for halos, guides, and the marquee. */
const SELECTION_BLUE = "#0072F5";

/**
 * How big a handle's invisible target is. Touch needs 44 CSS px (ADR 0016),
 * but a mouse does not: at that size a handle swallows the middle of a short
 * segment, and the segment underneath can no longer be clicked at all. A
 * fine pointer keeps the original's smaller targets and its precision.
 */
function handleTargetSize(): {
  readonly node: number;
  readonly control: number;
} {
  const coarse =
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(pointer: coarse)").matches;
  return coarse ? { node: 22, control: 44 } : { node: 13, control: 20 };
}

/** Tools the interaction machine understands; the rest it never sees. */
function interactionTool(tool: Tool): FieldInteractionContext["tool"] {
  return tool;
}

/** The depth a route may reach without leaving the drawn frame. */
function fieldDepthWindow(projection: SvgProjection) {
  return {
    minDepthYards: unprojectPoint(
      { x: 0, y: projection.height - 6 },
      projection,
    ).depthYards,
    maxDepthYards: unprojectPoint({ x: 0, y: 6 }, projection).depthYards,
  };
}

function selectionKey(kind: "player" | "path" | "label", id: string): string {
  return `${kind}:${id}`;
}

export function FieldDiagram({
  scene = stickThunderScene,
  selection,
  overlay,
  routeDotPlayerId,
  onHoverPlayer,
  onStartRoute,
  svgRef,
  ...pointerHandlers
}: {
  scene?: SvgRenderScene;
  /** Keys like "player:q" — absent means a non-interactive rendering. */
  selection?: ReadonlySet<string>;
  overlay?: React.ReactNode;
  /** The Player currently offering the blue draw-a-route dot, if any. */
  routeDotPlayerId?: string;
  onHoverPlayer?: (playerId: string | undefined) => void;
  onStartRoute?: (playerId: string) => void;
  svgRef?: React.Ref<SVGSVGElement>;
  onPointerDown?: React.PointerEventHandler<SVGSVGElement>;
  onPointerMove?: React.PointerEventHandler<SVGSVGElement>;
  onPointerUp?: React.PointerEventHandler<SVGSVGElement>;
  onPointerCancel?: React.PointerEventHandler<SVGSVGElement>;
  onDoubleClick?: React.MouseEventHandler<SVGSVGElement>;
}) {
  const selected = (kind: "player" | "path" | "label", id: string): boolean =>
    selection?.has(selectionKey(kind, id)) === true;
  return (
    <svg
      className="field-diagram"
      role="img"
      aria-label={`${scene.playName} football play`}
      // The field is driven by pointer events; letting mousedown run its
      // default would move focus to the document body, which would tear it
      // straight back out of a note the Coach was put into typing.
      onMouseDown={(event) => event.preventDefault()}
      ref={svgRef}
      viewBox={`0 0 ${scene.viewport.width} ${scene.viewport.height}`}
      {...pointerHandlers}
    >
      <defs>
        {Object.entries(sceneColors).map(([token, color]) => (
          <g key={token}>
            <marker
              id={`chalk-arrow-${token}`}
              markerHeight="13"
              markerUnits="userSpaceOnUse"
              markerWidth="13"
              orient="auto-start-reverse"
              refX="8.5"
              refY="5"
              viewBox="0 0 10 10"
            >
              <path d="M0 0 10 5 0 10z" fill={color} />
            </marker>
            <marker
              id={`chalk-dot-${token}`}
              markerHeight="10"
              markerUnits="userSpaceOnUse"
              markerWidth="10"
              orient="auto"
              refX="5"
              refY="5"
              viewBox="0 0 10 10"
            >
              <circle cx="5" cy="5" fill={color} r="3.6" />
            </marker>
            <marker
              id={`chalk-bar-${token}`}
              markerHeight="14"
              markerUnits="userSpaceOnUse"
              markerWidth="14"
              orient="auto"
              refX="5"
              refY="5"
              viewBox="0 0 10 10"
            >
              <path d="M5 0v10" fill="none" stroke={color} strokeWidth="2" />
            </marker>
            <marker
              id={`chalk-bubble-${token}`}
              markerHeight="20"
              markerUnits="userSpaceOnUse"
              markerWidth="20"
              orient="auto"
              refX="10"
              refY="10"
              viewBox="0 0 20 20"
            >
              <circle
                cx="10"
                cy="10"
                fill="#fff"
                r="7.5"
                stroke={color}
                strokeWidth="2"
              />
            </marker>
            <marker
              id={`chalk-hook-${token}`}
              markerHeight="15"
              markerUnits="userSpaceOnUse"
              markerWidth="15"
              orient="auto"
              refX="2"
              refY="6"
              viewBox="0 0 12 12"
            >
              <path
                d="M2 6a3.4 3.4 0 1 1 6.8 0 3.4 3.4 0 0 1-6.8 0"
                fill="none"
                stroke={color}
                strokeWidth="1.8"
              />
            </marker>
            <marker
              id={`chalk-chevron-${token}`}
              markerHeight="15"
              markerUnits="userSpaceOnUse"
              markerWidth="15"
              orient="auto"
              refX="10"
              refY="6"
              viewBox="0 0 12 12"
            >
              <path
                d="m2 2 4 4-4 4m4-8 4 4-4 4"
                fill="none"
                stroke={color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </marker>
            <marker
              id={`chalk-diamond-${token}`}
              markerHeight="14"
              markerUnits="userSpaceOnUse"
              markerWidth="14"
              orient="auto"
              refX="6"
              refY="6"
              viewBox="0 0 12 12"
            >
              <path
                d="m6 1.5 4.5 4.5L6 10.5 1.5 6z"
                fill="#fff"
                stroke={color}
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </marker>
            <marker
              id={`chalk-square-${token}`}
              markerHeight="12"
              markerUnits="userSpaceOnUse"
              markerWidth="12"
              orient="auto"
              refX="6"
              refY="6"
              viewBox="0 0 12 12"
            >
              <rect fill={color} height="7" width="7" x="2.5" y="2.5" />
            </marker>
          </g>
        ))}
      </defs>
      <rect
        className="field-paper"
        height={scene.viewport.height}
        width={scene.viewport.width}
      />
      {scene.field.yardLines.map((line) => (
        <line
          className={
            line.isLineOfScrimmage ? "line-of-scrimmage" : "field-grid"
          }
          data-field-yard-line={line.id}
          key={line.id}
          x1={line.x1}
          x2={line.x2}
          y1={line.y1}
          y2={line.y2}
        />
      ))}
      {scene.field.sidelines.map((line) => (
        <line
          className="field-grid"
          data-field-sideline={line.id}
          key={line.id}
          x1={line.x1}
          x2={line.x2}
          y1={line.y1}
          y2={line.y2}
        />
      ))}
      {[...scene.field.hashMarks, ...scene.field.sidelineMarks].map((line) => (
        <line
          className="hash"
          data-field-minor-mark={line.id}
          key={line.id}
          x1={line.x1}
          x2={line.x2}
          y1={line.y1}
          y2={line.y2}
        />
      ))}
      <g className="yard-numbers">
        {scene.field.numbers.map((number) => (
          <text
            data-field-number={number.id}
            fontSize={number.fontSize}
            key={number.id}
            x={number.x}
            y={number.y}
          >
            {number.value}
          </text>
        ))}
      </g>
      <g className="routes">
        {scene.paths.map((path) => (
          <g key={path.id}>
            {selected("path", path.id)
              ? [
                  ...path.strokes,
                  ...path.branches.flatMap((b) => b.strokes),
                ].map((stroke) => (
                  <path
                    d={stroke.d}
                    data-selected-path={path.id}
                    fill="none"
                    key={`sel-${stroke.id}`}
                    opacity="0.18"
                    pointerEvents="none"
                    stroke={SELECTION_BLUE}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="8.5"
                  />
                ))
              : null}
            {path.coverageArea ? (
              <g data-scene-coverage={path.coverageArea.id}>
                <ellipse
                  cx={path.coverageArea.center.x}
                  cy={path.coverageArea.center.y}
                  fill={path.coverageArea.fill}
                  opacity="0.26"
                  rx={path.coverageArea.radiusX}
                  ry={path.coverageArea.radiusY}
                />
                <ellipse
                  cx={path.coverageArea.center.x}
                  cy={path.coverageArea.center.y}
                  fill="none"
                  rx={path.coverageArea.radiusX}
                  ry={path.coverageArea.radiusY}
                  stroke={path.coverageArea.fill}
                  strokeDasharray="5 4"
                  strokeWidth="1.9"
                />
              </g>
            ) : null}
            {path.strokes.map((stroke) => (
              <RoutePath {...stroke} key={stroke.id} />
            ))}
            {path.ticks.map(({ color, ...tick }, index) => (
              <line
                data-scene-tick={`${path.id}-${index}`}
                key={`${path.id}-tick-${index}`}
                stroke={sceneColors[color]}
                strokeLinecap="round"
                strokeWidth="2.5"
                {...tick}
              />
            ))}
            {path.branches.flatMap((branch) => [
              ...branch.strokes.map((stroke) => (
                <RoutePath {...stroke} key={stroke.id} />
              )),
              ...branch.ticks.map(({ color, ...tick }, index) => (
                <line
                  data-scene-tick={`${branch.id}-${index}`}
                  key={`${branch.id}-tick-${index}`}
                  stroke={sceneColors[color]}
                  strokeLinecap="round"
                  strokeWidth="2.5"
                  {...tick}
                />
              )),
            ])}
          </g>
        ))}
      </g>
      <g className="field-annotations">
        {scene.labels.map((label) => (
          <g
            aria-label={label.ariaLabel}
            data-label-role={label.role}
            data-scene-label={label.id}
            key={label.id}
            role="img"
          >
            <title>{label.ariaLabel}</title>
            {label.leader ? (
              <>
                <line
                  data-label-leader={label.id}
                  opacity={label.leader.opacity}
                  stroke={label.leader.stroke}
                  strokeDasharray={label.leader.strokeDasharray}
                  strokeWidth={label.leader.strokeWidth}
                  x1={label.leader.x1}
                  x2={label.leader.x2}
                  y1={label.leader.y1}
                  y2={label.leader.y2}
                />
                <circle
                  cx={label.leader.x2}
                  cy={label.leader.y2}
                  fill={label.leader.stroke}
                  r={label.leader.endpointRadius}
                />
              </>
            ) : null}
            {label.box ? <SceneShape shape={label.box} /> : null}
            <SceneText text={label.text} />
            {selected("label", label.id) ? (
              <rect
                data-selected-label={label.id}
                fill="none"
                height={label.text.fontSize + 14}
                pointerEvents="none"
                rx={4}
                stroke={SELECTION_BLUE}
                strokeDasharray="3 3"
                strokeWidth={1}
                width={
                  Math.max(
                    24,
                    label.text.text.length * label.text.fontSize * 0.62,
                  ) + 16
                }
                x={
                  label.position.x -
                  (Math.max(
                    24,
                    label.text.text.length * label.text.fontSize * 0.62,
                  ) +
                    16) /
                    2
                }
                y={label.position.y - label.text.fontSize - 6}
              />
            ) : null}
          </g>
        ))}
      </g>
      <g className="players">
        {scene.players.map((player) => (
          <g
            aria-label={player.ariaLabel}
            className={selected("player", player.id) ? "selected" : undefined}
            data-scene-player={player.id}
            key={player.id}
            onPointerEnter={
              onHoverPlayer ? () => onHoverPlayer(player.id) : undefined
            }
            onPointerLeave={
              onHoverPlayer ? () => onHoverPlayer(undefined) : undefined
            }
            role="img"
            transform={`translate(${player.position.x} ${player.position.y})`}
          >
            <title>{player.ariaLabel}</title>
            {selected("player", player.id) ? (
              <circle
                className="selection-halo"
                fill="none"
                r={19}
                stroke={SELECTION_BLUE}
                strokeWidth={1.5}
                opacity={0.3}
              />
            ) : null}
            {player.shapes.map((shape, index) => (
              <SceneShape key={`${player.id}-shape-${index}`} shape={shape} />
            ))}
            {player.texts.map((text, index) => (
              <SceneText key={`${player.id}-text-${index}`} text={text} />
            ))}
            {routeDotPlayerId === player.id ? (
              <circle
                className="route-dot"
                cx={0}
                cy={-26}
                data-route-dot={player.id}
                fill={SELECTION_BLUE}
                onPointerDown={(event) => {
                  // The dot owns this press: it starts a route rather than
                  // letting the field begin a move.
                  event.stopPropagation();
                  onStartRoute?.(player.id);
                }}
                r={5}
                stroke="#FFFFFF"
                strokeWidth={1.5}
              >
                <title>Drag off to draw a route from this player</title>
              </circle>
            ) : null}
          </g>
        ))}
      </g>
      {overlay}
    </svg>
  );
}

/**
 * The handles on the one selected route: a circle on every break, a square
 * in the middle of every segment to bend it, and the zone corner. Their
 * radii are viewBox units, which the editor draws at no more than one CSS
 * pixel each, so they stay constant on screen and their invisible hit areas
 * clear the 44 CSS px touch minimum (ADR 0016).
 */
function RouteHandles({
  branchIndex,
  onHandleDown,
  path,
  projection,
  selectedNodeIndex,
  selectedSegmentIndex,
}: {
  /** Which line of the route carries the handles: a branch, or the main one. */
  branchIndex?: number;
  onHandleDown: (handle: FieldHandleRef, event: React.PointerEvent) => void;
  path: MovementPath;
  projection: SvgProjection;
  selectedNodeIndex?: number;
  selectedSegmentIndex?: number;
}) {
  const target = handleTargetSize();
  const line = lineOf(path, branchIndex);
  // A branch runs from the break it was split off at, so that point leads
  // the line and gives the first bend handle something to measure from.
  const branchOrigin =
    branchIndex === undefined
      ? undefined
      : path.points[path.branches[branchIndex]?.fromIndex ?? 0];
  const points = [...(branchOrigin ? [branchOrigin] : []), ...line].map(
    (point) => ({
      ...projectCoordinate(point, projection),
      control: point.control
        ? projectCoordinate(point.control, projection)
        : undefined,
    }),
  );
  // With a branch shown, index 0 is the main-line break it grows from, which
  // belongs to the main line and is not the branch's to move.
  const offset = branchOrigin ? 1 : 0;
  // An unsized drop shows its corner on the default bubble it is drawn with,
  // so the handle is where the Coach can already see the area.
  const coverage =
    path.kind === "zone" && path.style.ending === "bubble"
      ? (path.coverageArea ?? DEFAULT_ZONE_COVERAGE_RADII)
      : undefined;
  const zoneCenter = branchIndex === undefined ? points.at(-1) : undefined;

  /** The drawn shape of one segment, curve included. */
  const segmentPath = (index: number): string => {
    const from = points[index - 1]!;
    const to = points[index]!;
    return to.control
      ? `M ${from.x} ${from.y} Q ${to.control.x} ${to.control.y} ${to.x} ${to.y}`
      : `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  };
  // What the Coach has narrowed to: a whole branch, or one segment of the
  // main line. Either is drawn as a thick blue wash under the route.
  const highlighted =
    branchIndex !== undefined
      ? points.slice(1).map((_, index) => segmentPath(index + 1))
      : selectedSegmentIndex !== undefined && points[selectedSegmentIndex]
        ? [segmentPath(selectedSegmentIndex)]
        : [];

  return (
    <g className="route-handles">
      {highlighted.map((d, index) => (
        <path
          d={d}
          data-line-highlight={branchIndex === undefined ? "segment" : "branch"}
          fill="none"
          key={`highlight-${index}`}
          opacity={branchIndex === undefined ? 0.22 : 0.18}
          pointerEvents="none"
          stroke={SELECTION_BLUE}
          strokeLinecap="round"
          strokeWidth={9.5}
        />
      ))}
      {branchIndex === undefined
        ? path.branches.map((branch, index) => {
            const from = path.points[branch.fromIndex];
            if (!from) return null;
            const at = projectCoordinate(from, projection);
            // Where a choice route splits off. Clicking that line selects it.
            return (
              <circle
                cx={at.x}
                cy={at.y}
                data-branch-marker={index}
                fill={SELECTION_BLUE}
                key={`branch-${index}`}
                opacity={0.5}
                pointerEvents="none"
                r={3.5}
              />
            );
          })
        : null}
      {points.map((point, index) => {
        if (index === 0) return null;
        const previous = points[index - 1]!;
        // The bend handle sits where the segment actually passes, which for
        // a curved segment is the quadratic's own midpoint.
        const midpoint = point.control
          ? {
              x: (previous.x + 2 * point.control.x + point.x) / 4,
              y: (previous.y + 2 * point.control.y + point.y) / 4,
            }
          : { x: (previous.x + point.x) / 2, y: (previous.y + point.y) / 2 };
        return (
          <g key={`control-${index}`}>
            <rect
              fill="#FFFFFF"
              height={7}
              pointerEvents="none"
              rx={1.5}
              stroke="#8FC2F8"
              strokeWidth={1.5}
              width={7}
              x={midpoint.x - 3.5}
              y={midpoint.y - 3.5}
            />
            <rect
              className="handle-target"
              data-control-handle={index}
              fill="transparent"
              height={target.control}
              onPointerDown={(event) =>
                onHandleDown(
                  {
                    kind: "control",
                    pathId: path.id,
                    pointIndex: index - offset,
                    ...(branchIndex === undefined ? {} : { branchIndex }),
                  },
                  event,
                )
              }
              width={target.control}
              x={midpoint.x - target.control / 2}
              y={midpoint.y - target.control / 2}
            >
              <title>Curve handle — drag to bend this segment</title>
            </rect>
          </g>
        );
      })}
      {points.map((point, index) => {
        if (branchOrigin && index === 0) return null;
        const active = selectedNodeIndex === index - offset;
        return (
          <g key={`node-${index}`}>
            {active ? (
              <circle
                cx={point.x}
                cy={point.y}
                fill="none"
                opacity={0.35}
                pointerEvents="none"
                r={10}
                stroke={SELECTION_BLUE}
                strokeWidth={1.5}
              />
            ) : null}
            <circle
              cx={point.x}
              cy={point.y}
              fill={active ? SELECTION_BLUE : "#FFFFFF"}
              pointerEvents="none"
              r={active ? 6.5 : 5}
              stroke={SELECTION_BLUE}
              strokeWidth={active ? 2 : 1.5}
            />
            <circle
              className="handle-target"
              cx={point.x}
              cy={point.y}
              data-node-handle={index - offset}
              fill="transparent"
              onPointerDown={(event) =>
                onHandleDown(
                  {
                    kind: "node",
                    pathId: path.id,
                    pointIndex: index - offset,
                    ...(branchIndex === undefined ? {} : { branchIndex }),
                  },
                  event,
                )
              }
              r={target.node}
            >
              <title>
                {index - offset === 0
                  ? "Start — drag to move"
                  : index === points.length - 1
                    ? "End — drag to move"
                    : `Break ${index - offset} — drag to move`}
              </title>
            </circle>
          </g>
        );
      })}
      {coverage && zoneCenter
        ? (() => {
            const corner = {
              x:
                zoneCenter.x +
                coverage.radiusLateralYards * projection.lateralPixelsPerYard,
              y:
                zoneCenter.y -
                coverage.radiusDepthYards * projection.depthPixelsPerYard,
            };
            return (
              <g>
                <rect
                  fill="#FFFFFF"
                  height={7}
                  pointerEvents="none"
                  rx={1.5}
                  stroke={SELECTION_BLUE}
                  strokeWidth={1.5}
                  width={7}
                  x={corner.x - 3.5}
                  y={corner.y - 3.5}
                />
                <rect
                  className="handle-target zone-handle"
                  data-zone-handle={path.id}
                  fill="transparent"
                  height={44}
                  onPointerDown={(event) =>
                    onHandleDown({ kind: "zone", pathId: path.id }, event)
                  }
                  width={44}
                  x={corner.x - 22}
                  y={corner.y - 22}
                >
                  <title>Drag to size the zone he owns</title>
                </rect>
              </g>
            );
          })()
        : null}
    </g>
  );
}

/**
 * The transient layer of an in-flight gesture: snap guides, the depth
 * readout, and the marquee, drawn the way the original drew them.
 */
function FieldInteractionOverlay({
  drawing,
  gesture,
  projection,
}: {
  drawing?: FieldDrawingState;
  gesture: FieldGesture;
  projection: SvgProjection;
}) {
  if (drawing) {
    const drawn = drawing.points.map((point) => ({
      ...projectCoordinate(point, projection),
      control: point.control
        ? projectCoordinate(point.control, projection)
        : undefined,
    }));
    const cursor = projectCoordinate(drawing.cursor, projection);
    const commands = drawn.map((point, index) =>
      index === 0
        ? `M ${point.x} ${point.y}`
        : point.control
          ? `Q ${point.control.x} ${point.control.y} ${point.x} ${point.y}`
          : `L ${point.x} ${point.y}`,
    );
    return (
      <g className="drawing-overlay" pointerEvents="none">
        <path
          d={`${commands.join(" ")} L ${cursor.x} ${cursor.y}`}
          data-drawing-preview
          fill="none"
          stroke={SELECTION_BLUE}
          strokeDasharray="6 5"
          strokeWidth={2.5}
        />
        {drawn.map((point, index) => (
          <circle
            cx={point.x}
            cy={point.y}
            fill={SELECTION_BLUE}
            key={`draw-point-${index}`}
            r={3}
          />
        ))}
        {drawing.depthBuffer === "" ? null : (
          <text
            data-depth-buffer
            fill={SELECTION_BLUE}
            fontFamily="'Geist Mono', monospace"
            fontSize={11}
            x={cursor.x + 10}
            y={cursor.y - 10}
          >
            {`${drawing.depthBuffer} yds`}
          </text>
        )}
      </g>
    );
  }
  if (gesture.kind === "moving") {
    const readout = gesture.readout
      ? {
          ...projectCoordinate(gesture.readout.position, projection),
          text: gesture.readout.text,
          width: gesture.readout.text.length * 6.5 + 16,
        }
      : undefined;
    return (
      <g className="interaction-overlay" pointerEvents="none">
        {gesture.guides.map((guide) => {
          if (guide.axis === "lateral") {
            const x = projectCoordinate(
              { lateralYards: guide.valueYards, depthYards: 0 },
              projection,
            ).x;
            return (
              <g key={`lateral-${guide.valueYards}`}>
                <line
                  data-snap-guide="lateral"
                  opacity={0.65}
                  stroke={SELECTION_BLUE}
                  strokeDasharray="5 4"
                  strokeWidth={1}
                  x1={x}
                  x2={x}
                  y1={6}
                  y2={projection.height - 6}
                />
                <text
                  fill={SELECTION_BLUE}
                  fontFamily="'Geist Mono', monospace"
                  fontSize={10.5}
                  x={x + 6}
                  y={24}
                >
                  {guide.label}
                </text>
              </g>
            );
          }
          const y = projectCoordinate(
            { lateralYards: 0, depthYards: guide.valueYards },
            projection,
          ).y;
          return (
            <g key={`depth-${guide.valueYards}`}>
              <line
                data-snap-guide="depth"
                opacity={0.65}
                stroke={SELECTION_BLUE}
                strokeDasharray="5 4"
                strokeWidth={guide.strong ? 1.4 : 1}
                x1={projection.fieldInsetX}
                x2={projection.width - projection.fieldInsetX}
                y1={y}
                y2={y}
              />
              <text
                fill={SELECTION_BLUE}
                fontFamily="'Geist Mono', monospace"
                fontSize={10.5}
                x={20}
                y={y - 7}
              >
                {guide.label}
              </text>
            </g>
          );
        })}
        {readout ? (
          <g
            data-move-readout
            transform={`translate(${readout.x} ${readout.y})`}
          >
            <rect
              fill="#171717"
              height={20}
              rx={4}
              width={readout.width}
              x={14}
              y={-28}
            />
            <text
              fill="#FFFFFF"
              fontFamily="'Geist Mono', monospace"
              fontSize={11}
              textAnchor="middle"
              x={14 + readout.width / 2}
              y={-14}
            >
              {readout.text}
            </text>
          </g>
        ) : null}
      </g>
    );
  }
  if (gesture.kind === "marquee" && gesture.active) {
    const anchor = projectCoordinate(gesture.anchor, projection);
    const corner = projectCoordinate(gesture.corner, projection);
    return (
      <rect
        data-marquee
        fill="rgba(0,114,245,0.06)"
        height={Math.abs(corner.y - anchor.y)}
        pointerEvents="none"
        stroke={SELECTION_BLUE}
        strokeDasharray="4 3"
        strokeWidth={1}
        width={Math.abs(corner.x - anchor.x)}
        x={Math.min(anchor.x, corner.x)}
        y={Math.min(anchor.y, corner.y)}
      />
    );
  }
  return null;
}

const labelBoxChoices: ReadonlyArray<{ box: TextLabel["box"]; name: string }> =
  [
    { box: "none", name: "None" },
    { box: "fill", name: "Fill" },
    { box: "outline", name: "Outline" },
  ];

const labelColorChoices: ReadonlyArray<TextLabel["color"]> = [
  "ink",
  "blue",
  "red",
  "yellow",
  "green",
  "orange",
  "gray",
];

/**
 * The original's Text panel, shown only while one label is selected. The
 * idle panels stay exactly as they were when nothing is — which is the state
 * every parity golden captures.
 */
function LabelInspector({
  label,
  onAppearance,
  onDelete,
  onDeselect,
  onRole,
  onText,
  onTextCommitted,
  text,
  textInputRef,
}: {
  label: TextLabel;
  /** The draft the Coach is typing, which leads the committed text. */
  text: string;
  onAppearance: (appearance: LabelAppearance) => void;
  onDelete: () => void;
  onDeselect: () => void;
  onRole: (role: LabelRole) => void;
  onText: (text: string) => void;
  onTextCommitted: () => void;
  textInputRef: React.Ref<HTMLInputElement>;
}) {
  const boxed = label.box !== "none";
  return (
    <div className="label-inspector">
      <div className="section-heading label-heading">
        <button
          aria-label="Back to the play"
          className="back-button"
          onClick={onDeselect}
          title="Back to the play — esc"
          type="button"
        >
          ←
        </button>
        <span>Text</span>
      </div>
      <input
        aria-label="Label text"
        className="label-text"
        onBlur={onTextCommitted}
        onChange={(event) => onText(event.target.value)}
        ref={textInputRef}
        spellCheck={false}
        value={text}
      />
      <span className="field-label">Belongs to</span>
      <div className="segments">
        {(["offense", "defense"] as const).map((unit) => (
          <button
            className={
              (label.unit ?? "offense") === unit ? "active" : undefined
            }
            key={unit}
            onClick={() => onAppearance({ unit })}
            type="button"
          >
            {unit === "offense" ? "Offense" : "Defense"}
          </button>
        ))}
      </div>
      <span className="field-label">Meaning</span>
      <div className="button-grid">
        {(Object.keys(labelRolePresets) as ReadonlyArray<LabelRole>).map(
          (role) => (
            <button
              className={label.role === role ? "active" : undefined}
              key={role}
              onClick={() => onRole(role)}
              type="button"
            >
              {labelRolePresets[role].name}
            </button>
          ),
        )}
      </div>
      <span className="field-label">Size</span>
      <div className="segments">
        {labelSizeChoices.map(({ name, size }) => (
          <button
            className={label.size === size ? "active" : undefined}
            key={name}
            onClick={() => onAppearance({ size })}
            type="button"
          >
            {name}
          </button>
        ))}
      </div>
      <span className="field-label">Box</span>
      <div className="segments">
        {labelBoxChoices.map(({ box, name }) => (
          <button
            className={label.box === box ? "active" : undefined}
            key={box}
            onClick={() => onAppearance({ box })}
            type="button"
          >
            {name}
          </button>
        ))}
      </div>
      {/* A boxed label's colour is its box; an unboxed one's is its text. */}
      <span className="field-label">{boxed ? "Box color" : "Text color"}</span>
      <div className="color-row">
        {labelColorChoices.map((color) => (
          <button
            aria-label={color}
            aria-pressed={(boxed ? label.boxColor : label.color) === color}
            className={
              (boxed ? label.boxColor : label.color) === color
                ? "swatch active"
                : "swatch"
            }
            key={color}
            onClick={() =>
              onAppearance(boxed ? { boxColor: color } : { color })
            }
            style={{ background: sceneColors[color] }}
            type="button"
          />
        ))}
      </div>
      <p>
        Boxed labels are for calls and reminders — a yellow fill for coaching
        notes like “MAX SPLIT +4”, a red outline for a decision like “YES / NO”.
      </p>
      <div className="help-row">
        <button className="danger" onClick={onDelete} type="button">
          Delete
        </button>
      </div>
    </div>
  );
}

function Inspector({
  labelEditor,
  onOpenPalette,
  onOpenShortcuts,
}: {
  labelEditor?: React.ReactNode;
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
}) {
  if (labelEditor) {
    return (
      <aside className="inspector" aria-label="Play inspector">
        {labelEditor}
      </aside>
    );
  }
  return (
    <aside className="inspector" aria-label="Play inspector">
      <InspectorSection title="Formation">
        <button className="wide-picker">
          <span>Custom alignment</span>
          <span>– &nbsp;›</span>
        </button>
        <button className="round-add" aria-label="Save current formation">
          +
        </button>
        <div className="segment-row">
          <span>Ball on</span>
          <div className="segments">
            <button>L hash</button>
            <button className="active">Middle</button>
            <button>R hash</button>
          </div>
        </div>
        <p>
          Players move to the new alignment and every route stays attached to
          the man running it. Your 12 labels stay put.
        </p>
      </InspectorSection>
      <InspectorSection title="Line call">
        <div className="button-grid">
          <button>Pass set</button>
          <button>Set left</button>
          <button>Set right</button>
          <button>Drive</button>
          <button>Reach</button>
          <button>Cut</button>
        </div>
        <p>
          Applies to all 5 linemen at once — each one keeps his own alignment.
          Set left and Set right take the whole line the same way; the others
          mirror about the ball.
        </p>
      </InspectorSection>
      <InspectorSection title="Concept">
        <div className="button-grid">
          <button>Mesh</button>
          <button>Stick</button>
          <button>Smash</button>
          <button>Flood</button>
          <button>Dagger</button>
          <button>Drive</button>
          <button>Y-Cross</button>
          <button>Levels</button>
          <button>Spacing</button>
          <button>4 Verts</button>
        </div>
        <p>
          Draws the whole distribution by role — X, Z, H, Y and the back each
          get their job, mirrored to the side they line up on. Replaces their
          routes; blocking and coverage stay.
        </p>
      </InspectorSection>
      <InspectorSection title="Defense">
        <button className="wide-picker">
          <span>No defense yet</span>
          <span>– &nbsp;›</span>
        </button>
        <p>
          Each call replaces the last one and leaves the offense untouched. Just
          the front and secondary — letter symbols only, so you can draw your
          own coverage on top. Press Z to add your own drop.
        </p>
      </InspectorSection>
      <section className="inspector-section library-preview">
        <div className="section-heading library-heading">
          <span>Library · 10</span>
          <span>
            <button>Save</button>
            <button className="link-button">+ Variation</button>
          </span>
        </div>
        <span className="scope-label">Applies to</span>
        <div className="segments scope">
          <button className="active">This play</button>
          <button>Whole concept</button>
          <button>Pick…</button>
        </div>
        <p>Every change stays in the play you have open.</p>
        <div className="library-row current">
          <strong>Stick — Thunder</strong>
          <span>3rd down</span>
        </div>
        <div className="library-row">
          Jet Touch Pass <span>Pass</span>
        </div>
        <div className="library-row">
          Four Verticals <span>Pass</span>
        </div>
      </section>
      <InspectorSection title="Help">
        <div className="help-row">
          <button onClick={onOpenPalette} type="button">
            Commands ⌘K
          </button>
          <button onClick={onOpenShortcuts} type="button">
            Shortcuts ?
          </button>
        </div>
      </InspectorSection>
    </aside>
  );
}

function InspectorSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="inspector-section">
      <div className="section-heading">{title}</div>
      {children}
    </section>
  );
}

export function ChalkApp({ runtime }: { runtime: ChalkRuntime }) {
  const { editorStore } = runtime;
  const [activeView, setActiveView] = useState<View>("Editor");
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [openMenu, setOpenMenu] = useState<Menu>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  // The original gives each panel its own toggle and calls hiding both "Focus
  // mode"; it does not carry a third piece of state for focus.
  const [railOpen, setRailOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [zonesHidden, setZonesHidden] = useState(false);
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  const [freedStorage, setFreedStorage] = useState<ChalkRuntime["storage"]>();
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [interaction, setInteraction] = useState(idleFieldInteraction);
  const [hoveredPlayerId, setHoveredPlayerId] = useState<string>();
  // Pointer events can outpace React's render loop; the ref is the machine's
  // authoritative model so no event ever reduces against a stale one.
  const interactionRef = useRef<FieldInteractionModel>(interaction);
  const fieldSvgRef = useRef<SVGSVGElement | null>(null);
  const labelTextInputRef = useRef<HTMLInputElement | null>(null);
  // A label the Coach has just placed is waiting to be typed into. A ref,
  // not state: nothing renders from it, and clearing it must not re-render.
  const labelAwaitingTextRef = useRef<string | undefined>(undefined);
  /**
   * What the Coach is typing into a note, held here until he leaves the
   * field. The committed text arrives asynchronously (ADR 0012), so binding
   * the input straight to it would drop keystrokes that land mid-save — the
   * same reason the Play name has a draft in the EditorStore.
   */
  const [labelTextDraft, setLabelTextDraft] = useState<{
    readonly id: string;
    readonly text: string;
  }>();
  // Entities the Coach has just made whose commit has not landed. Selection
  // must not be pruned of something that is still on its way.
  const pendingInsertsRef = useRef<Set<string>>(new Set());
  // The runtime reports storage health; freeing space supersedes that reading.
  const storage = freedStorage ?? runtime.storage;
  const editor = useSyncExternalStore(
    editorStore.subscribe,
    editorStore.getSnapshot,
    editorStore.getSnapshot,
  );
  // Mid-drag the Coach sees the committed document with the gesture's own
  // command previewed on top — the exact document a release would commit.
  const previewCommand = gesturePreviewCommand(interaction, editor.document);
  const previewDocument = useMemo(
    () =>
      previewCommand
        ? applyPlayCommand(editor.document, previewCommand)
        : editor.document,
    [editor.document, previewCommand],
  );
  const scene = useMemo(
    () => buildSvgRenderScene(buildRenderScene(previewDocument)),
    [previewDocument],
  );
  const selectionKeys = useMemo(
    () =>
      new Set(
        interaction.selection.map(({ kind, id }) => selectionKey(kind, id)),
      ),
    [interaction.selection],
  );
  /** The one selected label, whose Text panel replaces the idle inspector. */
  const selectedLabel =
    interaction.selection.length === 1 &&
    interaction.selection[0]?.kind === "label"
      ? editor.document.labels.find(
          ({ id }) => id === interaction.selection[0]!.id,
        )
      : undefined;
  // A selected label with a leader offers a handle at the end it points to.
  const leaderHandleAt = (() => {
    const leader = previewDocument.labels.find(
      ({ id }) => id === selectedLabel?.id,
    )?.leader;
    return leader
      ? projectCoordinate(leader.endpoint, scene.viewport)
      : undefined;
  })();
  const runLabelCommand = (
    command: PlayCommand | undefined,
    options?: { coalesce?: boolean },
  ): void => {
    if (!command) return;
    void editorStore.applyCommand(command, options).catch(() => undefined);
  };
  /**
   * Handles belong to exactly one selected route, as in the original: a
   * multi-selection is being moved as a group, not edited node by node.
   */
  const selectedPath =
    activeTool === "select" &&
    !interaction.drawing &&
    interaction.selection.length === 1 &&
    interaction.selection[0]?.kind === "path"
      ? previewDocument.paths.find(
          ({ id }) => id === interaction.selection[0]!.id,
        )
      : undefined;
  /**
   * The original offers the draw-a-route dot on the selected or hovered
   * Player, under the select tool, when nothing is being drawn or dragged.
   */
  const routeDotPlayerId =
    activeTool === "select" &&
    !interaction.drawing &&
    interaction.gesture.kind === "idle"
      ? (interaction.selection.find(({ kind }) => kind === "player")?.id ??
        hoveredPlayerId)
      : undefined;

  const dispatchField = (event: FieldInteractionEvent): void => {
    const document = editorStore.getSnapshot().document;
    // The scene is only consulted for hit tests, so build it on demand.
    let renderScene: RenderScene | undefined;
    const result = fieldInteraction(interactionRef.current, event, {
      document,
      get scene() {
        renderScene ??= buildRenderScene(document);
        return renderScene;
      },
      screenScale: {
        lateralPixelsPerYard: scene.viewport.lateralPixelsPerYard,
        depthPixelsPerYard: scene.viewport.depthPixelsPerYard,
      },
      snap: { enabled: snapEnabled, grid: "off" },
      tool: interactionTool(activeTool),
      depthWindow: fieldDepthWindow(scene.viewport),
      createId: createStableId,
    });
    interactionRef.current = result.model;
    setInteraction(result.model);
    if (result.command) {
      for (const id of insertedEntityIds(result.command)) {
        pendingInsertsRef.current.add(id);
      }
      void editorStore.applyCommand(result.command).catch(() => undefined);
    }
    // Finishing a route hands the Coach back the select tool, as the
    // original does, so the route he just drew is his to adjust.
    if (result.requestedTool) setActiveTool(result.requestedTool);
    if (result.editingLabelId)
      labelAwaitingTextRef.current = result.editingLabelId;
  };
  // The keyboard listener registers once per menu state; these refs keep it
  // dispatching against the current closure and reading the live drawing.
  const dispatchFieldRef = useRef(dispatchField);
  const drawingRef = useRef(interaction.drawing);

  /** Switching tools abandons any route in progress, as the original does. */
  const selectTool = (tool: Tool): void => {
    if (interactionRef.current.drawing) dispatchField({ type: "escape" });
    setActiveTool(tool);
  };
  const selectToolRef = useRef(selectTool);
  useEffect(() => {
    dispatchFieldRef.current = dispatchField;
    drawingRef.current = interaction.drawing;
    selectToolRef.current = selectTool;
  });

  /**
   * A label the Coach just placed says "5 Yds" until he types over it, so
   * the field is focused and selected the moment the panel appears — one
   * gesture from pressing the field to writing the note.
   */
  useEffect(() => {
    if (!labelAwaitingTextRef.current) return;
    if (selectedLabel?.id !== labelAwaitingTextRef.current) return;
    labelAwaitingTextRef.current = undefined;
    labelTextInputRef.current?.focus();
    labelTextInputRef.current?.select();
  }, [selectedLabel?.id]);

  // An undo, redo, or restore may remove what the selection points at.
  useEffect(() => {
    const pending = pendingInsertsRef.current;
    for (const id of [...pending]) {
      const arrived =
        editor.document.players.some((entity) => entity.id === id) ||
        editor.document.paths.some((entity) => entity.id === id) ||
        editor.document.labels.some((entity) => entity.id === id);
      if (arrived) pending.delete(id);
    }
    const pruned = pruneFieldSelection(
      interactionRef.current,
      editor.document,
      pending,
    );
    if (pruned !== interactionRef.current) {
      interactionRef.current = pruned;
      setInteraction(pruned);
    }
  }, [editor.document]);

  /**
   * Client pixels to field yards. Measured against the field element itself
   * rather than the event target, because a handle's own rect is a target
   * too and would otherwise supply the wrong frame.
   */
  const fieldPointFromClient = (clientX: number, clientY: number) => {
    const bounds = fieldSvgRef.current?.getBoundingClientRect();
    if (!bounds) return { lateralYards: 0, depthYards: 0 };
    return unprojectPoint(
      {
        x: ((clientX - bounds.left) / bounds.width) * scene.viewport.width,
        y: ((clientY - bounds.top) / bounds.height) * scene.viewport.height,
      },
      scene.viewport,
    );
  };
  const fieldPointerInput = (event: React.PointerEvent) => ({
    point: fieldPointFromClient(event.clientX, event.clientY),
    pointerId: event.pointerId,
    shiftKey: event.shiftKey,
    button: event.button,
    pointerType: event.pointerType,
  });
  const onFieldPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture is best-effort; the gesture survives without it.
    }
    dispatchField({ type: "pointer-down", input: fieldPointerInput(event) });
  };
  const onFieldPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    dispatchField({ type: "pointer-move", input: fieldPointerInput(event) });
  };
  const onFieldPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    dispatchField({ type: "pointer-up", input: fieldPointerInput(event) });
  };
  const onHandleDown = (
    handle: FieldHandleRef,
    event: React.PointerEvent,
  ): void => {
    // The handle owns this press; the field must not also start a move.
    event.stopPropagation();
    const target = fieldSvgRef.current;
    try {
      target?.setPointerCapture(event.pointerId);
    } catch {
      // Capture is best-effort; the drag survives without it.
    }
    dispatchField({
      type: "handle-down",
      handle,
      input: fieldPointerInput(event),
    });
  };
  const onFieldDoubleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (interactionRef.current.drawing) {
      dispatchField({ type: "finish-drawing" });
      return;
    }
    // Double-clicking the selected route adds a break where the Coach
    // pointed, the way the original did.
    const selected = interactionRef.current.selection.find(
      ({ kind }) => kind === "path",
    );
    if (!selected) return;
    dispatchField({
      type: "insert-node",
      pathId: selected.id,
      point: fieldPointFromClient(event.clientX, event.clientY),
    });
  };
  const onFieldPointerCancel = () => {
    dispatchField({ type: "pointer-cancel" });
  };
  const commitPlayName = () => {
    void editorStore.commitPlayName().catch(() => undefined);
  };
  // The acknowledgement is a status, not a durability button: the only thing
  // to press is a retry when a local save failed (ADR 0012).
  const retrySave = () => {
    if (editor.localSave.phase !== "error") return;
    void editorStore.retryLocalSave().catch(() => undefined);
  };
  const createVersion = (label: string) => {
    void editorStore.createVersion(label).catch(() => undefined);
  };
  const restoreVersion = (revisionId: string) => {
    void editorStore.restoreVersion(revisionId).catch(() => undefined);
  };
  const releaseStorage = () => {
    void runtime
      .releaseDerivedStorage()
      .then(setFreedStorage)
      .catch(() => undefined);
  };
  const undo = () => {
    void editorStore.undo().catch(() => undefined);
  };
  const redo = () => {
    void editorStore.redo().catch(() => undefined);
  };
  const focused = !railOpen && !inspectorOpen;
  const toggleMenu = (menu: Exclude<Menu, null>) =>
    setOpenMenu((current) => (current === menu ? null : menu));
  const setPanels = (shown: boolean) => {
    setRailOpen(shown);
    setInspectorOpen(shown);
  };

  /**
   * What production can run today. A command the editor cannot yet perform is
   * deliberately absent so the menus show it as unavailable rather than
   * accepting a click and doing nothing.
   */
  const actions: ActionMap = {
    toolSelect: () => selectTool("select"),
    toolPlayer: () => selectTool("player"),
    toolRoute: () => selectTool("route"),
    toolMotion: () => selectTool("motion"),
    toolBlock: () => selectTool("block"),
    toolZone: () => selectTool("zone"),
    toolText: () => selectTool("text"),
    focus: () => setPanels(false),
    showPanels: () => setPanels(true),
    toggleInspector: () => setInspectorOpen((shown) => !shown),
    toggleRail: () => setRailOpen((shown) => !shown),
    toggleZones: () => setZonesHidden((hidden) => !hidden),
    // Reflects what the Coach has picked, or the whole Play when he has
    // picked nothing — the same call either way.
    mirror: () => {
      dispatchFieldRef.current({ type: "mirror" });
      setOpenMenu(null);
    },
    present: () => setActiveView("Present"),
    print: () => setActiveView("Print"),
    shortcuts: () => setOverlay("shortcuts"),
    // Chalk saves continuously (ADR 0012); an explicit Save flushes whatever
    // the Coach is still typing rather than pretending durability is manual.
    savePlay: () => {
      commitPlayName();
      setOpenMenu(null);
    },
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      const meta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (event.key === "Escape") {
        if (overlay !== null || openMenu !== null) {
          setOverlay(null);
          setOpenMenu(null);
          return;
        }
        // With no chrome to close, Escape cancels the gesture or clears the
        // selection, the way the original stepped outward.
        if (!typing) dispatchFieldRef.current({ type: "escape" });
        return;
      }
      if (meta && key === "k") {
        event.preventDefault();
        setOpenMenu(null);
        setOverlay("palette");
        return;
      }
      if (meta && key === "s") {
        event.preventDefault();
        setOverlay(null);
        setOpenMenu((current) => (current === "save" ? null : "save"));
        return;
      }
      if (meta && key === "a" && !typing) {
        event.preventDefault();
        dispatchFieldRef.current({ type: "select-all" });
        return;
      }
      if (meta && !typing && (key === "c" || key === "v" || key === "d")) {
        event.preventDefault();
        dispatchFieldRef.current({
          type: key === "c" ? "copy" : key === "v" ? "paste" : "duplicate",
        });
        return;
      }
      if (event.key === "?" && !typing) {
        event.preventDefault();
        setOverlay("shortcuts");
        return;
      }
      if (typing || meta || event.altKey) return;
      if (event.key === "Enter") {
        // Enter ends the route being drawn; with nothing in flight it is the
        // machine's own no-op.
        event.preventDefault();
        dispatchFieldRef.current({ type: "finish-drawing" });
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        dispatchFieldRef.current({ type: "delete" });
        return;
      }
      if (drawingRef.current && /^[0-9.]$/.test(event.key)) {
        // Digits typed mid-route set the next break's exact depth, so they
        // must never also pick a tool.
        event.preventDefault();
        dispatchFieldRef.current({ type: "depth-digit", digit: event.key });
        return;
      }
      const nudges: Record<string, readonly [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, 1],
        ArrowDown: [0, -1],
      };
      const nudge = nudges[event.key];
      if (nudge) {
        event.preventDefault();
        // Half a yard per press; Shift refines to a tenth (ADR 0016's
        // keyboard alternative to dragging — the original had no nudge).
        const step = event.shiftKey ? 0.1 : 0.5;
        dispatchFieldRef.current({
          type: "nudge",
          lateralYards: nudge[0] * step,
          depthYards: nudge[1] * step,
        });
        return;
      }
      if (event.shiftKey) return;
      const toolKeys: Record<string, Tool> = {
        v: "select",
        p: "player",
        r: "route",
        m: "motion",
        b: "block",
        z: "zone",
        t: "text",
      };
      const tool = toolKeys[key];
      if (tool) {
        selectToolRef.current(tool);
        return;
      }
      if (key === "s") setSnapEnabled((enabled) => !enabled);
    };

    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [openMenu, overlay]);

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".menu")) return;
      setOpenMenu(null);
    };
    globalThis.addEventListener("pointerdown", onPointerDown);
    return () => globalThis.removeEventListener("pointerdown", onPointerDown);
  }, [openMenu]);

  const header = (
    <Header
      actions={actions}
      activeView={activeView}
      commitPlayName={commitPlayName}
      focused={focused}
      onCloseMenu={() => setOpenMenu(null)}
      onCreateVersion={createVersion}
      onMenu={toggleMenu}
      onRedo={redo}
      onRestoreVersion={restoreVersion}
      onUndo={undo}
      onView={setActiveView}
      openMenu={openMenu}
      playName={editor.draftPlayName}
      resetPlayName={editorStore.resetPlayNameDraft}
      runtime={runtime}
      setPlayName={editorStore.setPlayNameDraft}
      undo={editor.undo}
      versions={editor.versions}
      zonesHidden={zonesHidden}
    />
  );

  if (activeView !== "Editor") {
    return (
      <div className={`chalk-shell view-${activeView.toLowerCase()}`}>
        {header}
        <div className="mode-placeholder">
          <FieldDiagram scene={scene} />
          <div className="mode-label">{activeView} mode</div>
        </div>
      </div>
    );
  }

  return (
    <div className="chalk-shell">
      {header}
      <div className="workspace">
        {railOpen ? (
          <nav className="tool-rail" aria-label="Drawing tools">
            {tools.map((tool) => (
              <button
                className={activeTool === tool.id ? "active" : ""}
                key={tool.id}
                onClick={() => selectTool(tool.id)}
                title={`${tool.label} — ${tool.shortcut}`}
                aria-label={`${tool.label} — ${tool.shortcut}`}
              >
                <ToolIcon glyph={tool.glyph} />
              </button>
            ))}
            <span className="rail-spacer" />
            <button aria-label="Clear a layer">
              <ToolIcon glyph="block" />
            </button>
            <button aria-label="Angle snap 45 degrees">
              <ToolIcon glyph="route" />
            </button>
            <button
              className="rail-collapse"
              aria-label="Hide the tools"
              onClick={() => setRailOpen(false)}
              title="Hide the tools — ⌥2"
            >
              ‹
            </button>
          </nav>
        ) : null}
        <main className="editor-stage">
          <DeviceNotices
            onDismissRecovery={() => setRecoveryDismissed(true)}
            onReleaseStorage={releaseStorage}
            recovery={recoveryDismissed ? undefined : runtime.recovery}
            storage={storage}
          />
          <div
            className="field-wrap"
            data-drawing={interaction.drawing ? "true" : undefined}
            data-tool={activeTool}
          >
            <FieldDiagram
              onPointerCancel={onFieldPointerCancel}
              onPointerDown={onFieldPointerDown}
              onPointerMove={onFieldPointerMove}
              onPointerUp={onFieldPointerUp}
              onDoubleClick={onFieldDoubleClick}
              onHoverPlayer={setHoveredPlayerId}
              onStartRoute={(playerId) =>
                dispatchField({ type: "start-route", playerId })
              }
              overlay={
                <>
                  <FieldInteractionOverlay
                    drawing={interaction.drawing}
                    gesture={interaction.gesture}
                    projection={scene.viewport}
                  />
                  {selectedPath ? (
                    <RouteHandles
                      branchIndex={interaction.selectedBranchIndex}
                      onHandleDown={onHandleDown}
                      path={selectedPath}
                      projection={scene.viewport}
                      selectedNodeIndex={interaction.selectedNodeIndex}
                      selectedSegmentIndex={interaction.selectedSegmentIndex}
                    />
                  ) : null}
                  {leaderHandleAt ? (
                    <circle
                      className="handle-target"
                      cx={leaderHandleAt.x}
                      cy={leaderHandleAt.y}
                      data-leader-handle={selectedLabel!.id}
                      fill="transparent"
                      onPointerDown={(event) =>
                        onHandleDown(
                          { kind: "leader", labelId: selectedLabel!.id },
                          event,
                        )
                      }
                      r={22}
                    >
                      <title>Drag to point the leader line</title>
                    </circle>
                  ) : null}
                </>
              }
              routeDotPlayerId={routeDotPlayerId}
              scene={scene}
              selection={selectionKeys}
              svgRef={fieldSvgRef}
            />
          </div>
          <div className="timeline" aria-label="Playback controls">
            <button aria-label="Play">▶</button>
            <span className="scrubber">
              <i />
            </span>
            <code>0.0s / 3.1s</code>
            <span className="speed">
              <button>0.5×</button>
              <button className="active">1×</button>
              <button>2×</button>
            </span>
            <button aria-label="Reset">⟲</button>
          </div>
          <div className="statusbar">
            <span>
              drag the blue dot above a player to draw his route — double-click
              a line to add a node · ⌫ delete
            </span>
            <span>
              {/* One string, so live values cannot disturb the original's
                  exact spacing. */}
              {`− \u00A0 100% \u00A0 + \u00A0\u00A0 SELECTION \u00A0\u00A0 BALL \u00A0\u00A0 CUSTOM ALIGNMENT \u00A0\u00A0 SNAP ${
                snapEnabled ? "ON" : "OFF"
              } \u00A0\u00A0 ${editor.document.players.length}P · ${
                editor.document.paths.filter(({ kind }) => kind === "route")
                  .length
              }R \u00A0\u00A0`}
              <button
                aria-label={localSaveMessage(editor.localSave)}
                className={`save-state ${editor.localSave.phase}`}
                data-save-duration-ms={
                  "durationMs" in editor.localSave
                    ? editor.localSave.durationMs
                    : undefined
                }
                data-save-within-budget={
                  "withinBudget" in editor.localSave
                    ? editor.localSave.withinBudget
                    : undefined
                }
                disabled={editor.localSave.phase !== "error"}
                onClick={retrySave}
              >
                {localSaveStatus(editor.localSave)}
              </button>
            </span>
          </div>
        </main>
        {inspectorOpen ? (
          <Inspector
            labelEditor={
              selectedLabel ? (
                <LabelInspector
                  label={selectedLabel}
                  onAppearance={(appearance) =>
                    runLabelCommand(
                      setLabelAppearanceCommand(
                        editor.document,
                        selectedLabel.id,
                        appearance,
                      ),
                    )
                  }
                  onDelete={() => dispatchField({ type: "delete" })}
                  onDeselect={() => dispatchField({ type: "escape" })}
                  onRole={(role) =>
                    runLabelCommand(
                      applyLabelRoleCommand(
                        editor.document,
                        selectedLabel.id,
                        role,
                      ),
                    )
                  }
                  onText={(text) => {
                    setLabelTextDraft({ id: selectedLabel.id, text });
                    runLabelCommand(
                      setLabelTextCommand(
                        editor.document,
                        selectedLabel.id,
                        text,
                      ),
                      // Consecutive keystrokes merge into one undo entry
                      // until the Coach leaves the field (ADR 0012).
                      { coalesce: true },
                    );
                  }}
                  onTextCommitted={() => {
                    editorStore.endCoalescing();
                    setLabelTextDraft(undefined);
                  }}
                  text={
                    labelTextDraft?.id === selectedLabel.id
                      ? labelTextDraft.text
                      : selectedLabel.text
                  }
                  textInputRef={labelTextInputRef}
                />
              ) : undefined
            }
            onOpenPalette={() => setOverlay("palette")}
            onOpenShortcuts={() => setOverlay("shortcuts")}
          />
        ) : (
          <button
            className="inspector-stub"
            onClick={() => setInspectorOpen(true)}
            title="Show the inspector — ⌥1"
            type="button"
          >
            Inspector
          </button>
        )}
      </div>
      {overlay === "palette" ? (
        <CommandPalette actions={actions} onClose={() => setOverlay(null)} />
      ) : null}
      {overlay === "shortcuts" ? (
        <ShortcutReference onClose={() => setOverlay(null)} />
      ) : null}
    </div>
  );
}

const storageMessages: Record<string, string> = {
  watch: "This device is running low on space for Chalk.",
  critical: "This device is nearly out of space for Chalk.",
};

type BackupState =
  | { readonly phase: "idle" }
  | { readonly phase: "working" }
  | { readonly phase: "done"; readonly message: string }
  | { readonly phase: "error"; readonly message: string };

function BackupPanel({ runtime }: { runtime: ChalkRuntime }) {
  const [open, setOpen] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [state, setState] = useState<BackupState>({ phase: "idle" });

  const download = (contents: string) => {
    const url = URL.createObjectURL(
      new Blob([contents], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "chalk-backup.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const backUp = () => {
    setState({ phase: "working" });
    runtime
      .exportEncryptedBackup(passphrase)
      .then((contents) => {
        download(contents);
        setPassphrase("");
        setState({ phase: "done", message: "Backup saved to this device." });
      })
      .catch(() =>
        setState({
          phase: "error",
          message: "Chalk could not write a backup.",
        }),
      );
  };

  const restore = (file: File) => {
    setState({ phase: "working" });
    file
      .text()
      .then((contents) => runtime.importEncryptedBackup(contents, passphrase))
      .then((result) => {
        setPassphrase("");
        setState({
          phase: "done",
          message: `Restored ${result.plays} ${
            result.plays === 1 ? "Play" : "Plays"
          }. Newer work on this device was kept.`,
        });
      })
      .catch(() =>
        setState({
          phase: "error",
          message:
            "That passphrase does not open this backup, or the file has been altered.",
        }),
      );
  };

  return (
    <div className="backup-section">
      <button
        aria-expanded={open}
        className="menu-entry"
        onClick={() => setOpen((shown) => !shown)}
        type="button"
      >
        Backup
      </button>
      <div className="backup-panel" hidden={!open}>
        <label className="backup-field">
          <span>Passphrase</span>
          <input
            aria-label="Backup passphrase"
            autoComplete="off"
            onChange={(event) => setPassphrase(event.target.value)}
            type="password"
            value={passphrase}
          />
        </label>
        <p className="version-empty">
          Chalk encrypts the backup on this device. A passphrase you lose cannot
          be recovered.
        </p>
        <button
          disabled={!passphrase || state.phase === "working"}
          onClick={backUp}
          type="button"
        >
          Back up my Playbooks
        </button>
        <label className="backup-field">
          <span>Restore a backup</span>
          <input
            accept="application/json"
            aria-label="Backup file"
            disabled={!passphrase || state.phase === "working"}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) restore(file);
            }}
            type="file"
          />
        </label>
        {state.phase === "done" || state.phase === "error" ? (
          <p className={`backup-status ${state.phase}`} role="status">
            {state.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function DeviceNotices({
  onDismissRecovery,
  onReleaseStorage,
  recovery,
  storage,
}: {
  onDismissRecovery: () => void;
  onReleaseStorage: () => void;
  recovery: ChalkRuntime["recovery"] | undefined;
  storage: ChalkRuntime["storage"];
}) {
  const storageMessage = storageMessages[storage.pressure];
  if (!recovery?.interrupted && !storageMessage) return null;

  return (
    <div className="device-notices">
      {recovery?.interrupted ? (
        <div className="notice recovery" role="status">
          <span>
            Chalk closed unexpectedly
            {recovery.previousStartedAtMs === undefined
              ? ""
              : ` on ${new Date(recovery.previousStartedAtMs).toLocaleDateString()}`}
            . Every edit saved on this device is here.
          </span>
          <button onClick={onDismissRecovery} type="button">
            Dismiss
          </button>
        </div>
      ) : null}
      {storageMessage ? (
        <div
          className="notice storage"
          data-storage={storage.pressure}
          role="status"
        >
          <span>{storageMessage}</span>
          <button onClick={onReleaseStorage} type="button">
            Free space
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Header({
  actions,
  activeView,
  commitPlayName,
  focused,
  onCloseMenu,
  onCreateVersion,
  onMenu,
  onRedo,
  onRestoreVersion,
  onUndo,
  onView,
  openMenu,
  playName,
  resetPlayName,
  runtime,
  setPlayName,
  undo,
  versions,
  zonesHidden,
}: {
  actions: ActionMap;
  activeView: View;
  commitPlayName: () => void;
  focused: boolean;
  onCloseMenu: () => void;
  onCreateVersion: (label: string) => void;
  onMenu: (menu: "more" | "export" | "save") => void;
  onRedo: () => void;
  onRestoreVersion: (revisionId: string) => void;
  onUndo: () => void;
  onView: (view: View) => void;
  openMenu: Menu;
  playName: string;
  resetPlayName: () => void;
  runtime: ChalkRuntime;
  setPlayName: (name: string) => void;
  undo: EditorUndoState;
  versions: readonly EditorVersionSummary[];
  zonesHidden: boolean;
}) {
  return (
    <header className="topbar">
      <div className="chalk-mark" aria-hidden="true">
        <i />
      </div>
      <strong className="brand">{PRODUCT_NAME}</strong>
      <nav className="view-tabs" aria-label="Workspace views">
        {views.map((view) => (
          <button
            className={activeView === view ? "active" : ""}
            key={view}
            onClick={() => onView(view)}
          >
            {view}
          </button>
        ))}
      </nav>
      <span className="slash">/</span>
      <input
        aria-label="Play name"
        className="play-name"
        onBlur={commitPlayName}
        onChange={(event) => setPlayName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            resetPlayName();
            event.currentTarget.blur();
          }
        }}
        spellCheck={false}
        value={playName}
      />
      <label className="play-type">
        <i />
        <select aria-label="Play type" defaultValue="Pass">
          <option>Pass</option>
          <option>Run</option>
          <option>RPO</option>
          <option>Screen</option>
          <option>Defense</option>
          <option>Special</option>
        </select>
      </label>
      <span className="top-spacer" />
      <button
        className="quiet"
        disabled={!undo.canUndo}
        onClick={onUndo}
        title={undo.undoLabel ? `Undo ${undo.undoLabel}` : "Nothing to undo"}
      >
        Undo
      </button>
      <button
        className="quiet"
        disabled={!undo.canRedo}
        onClick={onRedo}
        title={undo.redoLabel ? `Redo ${undo.redoLabel}` : "Nothing to redo"}
      >
        Redo
      </button>
      <span className="divider" />
      <MoreMenu
        actions={actions}
        focused={focused}
        onDismiss={onCloseMenu}
        onToggle={() => onMenu("more")}
        open={openMenu === "more"}
        zonesHidden={zonesHidden}
      >
        <BackupPanel runtime={runtime} />
      </MoreMenu>
      <ExportMenu
        actions={actions}
        onDismiss={onCloseMenu}
        onToggle={() => onMenu("export")}
        open={openMenu === "export"}
        playName={playName}
      />
      <SaveMenu
        actions={actions}
        onDismiss={onCloseMenu}
        onSnapshot={onCreateVersion}
        onToggle={() => onMenu("save")}
        open={openMenu === "save"}
        saveLabel="Save"
      >
        {versions.length > 0 ? (
          <ul className="snapshot-list">
            {versions.map((version) => (
              <li key={version.id}>
                <span>{version.label ?? "Unnamed version"}</span>
                <button
                  onClick={() => onRestoreVersion(version.id)}
                  type="button"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </SaveMenu>
    </header>
  );
}
