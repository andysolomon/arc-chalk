import { stickThunderPlay } from "@chalk/domain";
import { type Camera } from "@chalk/editor";
import {
  buildRenderScene,
  buildSvgRenderScene,
  type SvgPathStroke,
  type SvgRenderScene,
  type SvgShapePrimitive,
  type SvgTextPrimitive,
} from "@chalk/render";
import { useLayoutEffect } from "react";

import { applyLiveFieldPaint, type LiveFieldPaint } from "./live-field-paint";
import { sceneColors, SELECTION_BLUE, selectionKey } from "./field-marks";

const stickThunderScene = buildSvgRenderScene(
  buildRenderScene(stickThunderPlay),
);

const routeDashes: Record<SvgPathStroke["style"]["line"], string | undefined> =
  {
    solid: undefined,
    dashed: "8 6",
    dotted: "2 6",
    zigzag: undefined,
  };

function RoutePath({
  d,
  draw = 1,
  id,
  style,
}: {
  d: string;
  draw?: number;
  id: string;
  style: SvgPathStroke["style"];
}) {
  if (draw <= 0) return null;
  const markerEnd =
    style.ending === "none" || draw <= 0.97
      ? undefined
      : `url(#chalk-${style.ending}-${style.color})`;
  const dashed = routeDashes[style.line];
  const tracing = draw < 1 && dashed === undefined;

  return (
    <path
      d={d}
      data-scene-path={id}
      fill="none"
      markerEnd={markerEnd}
      opacity={tracing ? undefined : draw}
      pathLength={tracing ? 1 : undefined}
      stroke={sceneColors[style.color]}
      strokeDasharray={tracing ? 1 : dashed}
      strokeDashoffset={tracing ? 1 - draw : undefined}
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

export function FieldDiagram({
  camera,
  reveal,
  scene = stickThunderScene,
  selection,
  overlay,
  livePreviewRef,
  routeDotPlayerId,
  onHoverPlayer,
  onStartRoute,
  svgRef,
  ...pointerHandlers
}: {
  /** The part of the drawn frame on screen; absent shows all of it. */
  camera?: Camera;
  /**
   * How far each entity has appeared, 0–1. Demo uses this to draw the
   * original's step reveal; absent means everything is on the field.
   */
  reveal?: (id: string) => number;
  scene?: SvgRenderScene;
  /** Keys like "player:q" — absent means a non-interactive rendering. */
  selection?: ReadonlySet<string>;
  overlay?: React.ReactNode;
  /**
   * Live pointer preview applied after React commits, so a save
   * acknowledgement cannot wipe a drag that is still in the Coach's hand.
   */
  livePreviewRef?: React.RefObject<LiveFieldPaint | undefined>;
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
  onContextMenu?: React.MouseEventHandler<SVGSVGElement>;
  onWheel?: React.WheelEventHandler<SVGSVGElement>;
}) {
  const selected = (kind: "player" | "path" | "label", id: string): boolean =>
    selection?.has(selectionKey(kind, id)) === true;
  const viewBox = camera
    ? `${camera.x} ${camera.y} ${camera.width} ${camera.height}`
    : `0 0 ${scene.viewport.width} ${scene.viewport.height}`;
  useLayoutEffect(() => {
    const node = svgRef && typeof svgRef !== "function" ? svgRef.current : null;
    if (!node) return;
    node.setAttribute(
      "data-react-commits",
      String(Number(node.getAttribute("data-react-commits") ?? "0") + 1),
    );
    if (livePreviewRef) applyLiveFieldPaint(node, livePreviewRef.current);
  });
  return (
    <svg
      className="field-diagram"
      data-base-viewbox={viewBox}
      data-field-style={scene.field.style}
      data-react-commits="0"
      data-type-preset={scene.typePreset}
      role="img"
      aria-label={`${scene.playName} football play`}
      // The field is driven by pointer events; letting mousedown run its
      // default would move focus to the document body, which would tear it
      // straight back out of a note the Coach was put into typing.
      onMouseDown={(event) => event.preventDefault()}
      ref={svgRef}
      viewBox={viewBox}
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
        {scene.paths.map((path) => {
          const shown = reveal?.(path.id) ?? 1;
          if (shown <= 0) return null;
          const tickOpacity =
            shown <= 0.5 ? 0 : Math.min(1, (shown - 0.5) / 0.3);
          return (
            <g
              aria-label={path.ariaLabel}
              data-scene-path-group={path.id}
              {...(path.trail ? { "data-scene-trail": path.id } : {})}
              key={path.id}
              opacity={path.opacity}
              role="img"
            >
              <title>{path.ariaLabel}</title>
              {selected("path", path.id)
                ? [
                    ...path.strokes,
                    ...path.branches.flatMap((b) => b.strokes),
                  ].map((stroke) => (
                    <path
                      d={stroke.d}
                      data-print-chrome=""
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
                <g data-scene-coverage={path.coverageArea.id} opacity={shown}>
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
                <RoutePath {...stroke} draw={shown} key={stroke.id} />
              ))}
              {tickOpacity > 0
                ? path.ticks.map(({ color, ...tick }, index) => (
                    <line
                      data-scene-tick={`${path.id}-${index}`}
                      key={`${path.id}-tick-${index}`}
                      opacity={tickOpacity}
                      stroke={sceneColors[color]}
                      strokeLinecap="round"
                      strokeWidth="2.5"
                      {...tick}
                    />
                  ))
                : null}
              {path.coaching ? (
                <g
                  className="route-coaching"
                  opacity={shown}
                  pointerEvents="none"
                >
                  {path.coaching.read ? (
                    <g data-scene-read={path.coaching.read.id}>
                      <circle
                        cx={path.coaching.read.center.x}
                        cy={path.coaching.read.center.y}
                        fill="#fff"
                        r={path.coaching.read.radius}
                        stroke={SELECTION_BLUE}
                        strokeWidth="1.4"
                      />
                      <SceneText
                        text={{
                          ...path.coaching.read.text,
                          // Centred in the circle rather than sitting on its
                          // middle, the way a number in a bubble reads.
                          y:
                            path.coaching.read.text.y +
                            path.coaching.read.text.fontSize * 0.35,
                        }}
                      />
                    </g>
                  ) : null}
                  {path.coaching.notes.map((note) => (
                    <g data-scene-coaching={note.id} key={note.id}>
                      <SceneText text={note.text} />
                    </g>
                  ))}
                </g>
              ) : null}
              {path.branches.flatMap((branch, branchIndex) => {
                const branchShown = reveal?.(`${path.id}.b${branchIndex}`) ?? 1;
                if (branchShown <= 0) return [];
                const branchTick =
                  branchShown <= 0.5
                    ? 0
                    : Math.min(1, (branchShown - 0.5) / 0.3);
                return [
                  ...branch.strokes.map((stroke) => (
                    <RoutePath {...stroke} draw={branchShown} key={stroke.id} />
                  )),
                  ...(branchTick > 0
                    ? branch.ticks.map(({ color, ...tick }, index) => (
                        <line
                          data-scene-tick={`${branch.id}-${index}`}
                          key={`${branch.id}-tick-${index}`}
                          opacity={branchTick}
                          stroke={sceneColors[color]}
                          strokeLinecap="round"
                          strokeWidth="2.5"
                          {...tick}
                        />
                      ))
                    : []),
                ];
              })}
            </g>
          );
        })}
      </g>
      <g className="field-annotations">
        {scene.labels.map((label) => {
          const shown = reveal?.(label.id) ?? 1;
          if (shown <= 0) return null;
          return (
            <g
              aria-label={label.ariaLabel}
              data-label-role={label.role}
              data-scene-label={label.id}
              key={label.id}
              opacity={shown}
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
                  data-print-chrome=""
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
          );
        })}
      </g>
      <g className="players">
        {scene.players.map((player) => {
          const shown = reveal?.(player.id) ?? 1;
          if (shown <= 0) return null;
          return (
            <g
              aria-label={player.ariaLabel}
              className={selected("player", player.id) ? "selected" : undefined}
              data-base-x={player.position.x}
              data-base-y={player.position.y}
              data-scene-player={player.id}
              key={player.id}
              onPointerEnter={
                onHoverPlayer ? () => onHoverPlayer(player.id) : undefined
              }
              onPointerLeave={
                onHoverPlayer ? () => onHoverPlayer(undefined) : undefined
              }
              opacity={shown}
              role="img"
              transform={`translate(${player.position.x} ${player.position.y})`}
            >
              <title>{player.ariaLabel}</title>
              {selected("player", player.id) ? (
                <circle
                  className="selection-halo"
                  data-print-chrome=""
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
                  data-print-chrome=""
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
          );
        })}
      </g>
      {overlay ? <g data-print-chrome="">{overlay}</g> : null}
    </svg>
  );
}
