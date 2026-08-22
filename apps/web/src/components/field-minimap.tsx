import type { Player } from "@chalk/domain";
import {
  centreCamera,
  MINIMAP_SIZE,
  minimapFramePoint,
  minimapIsShown,
  minimapLineOfScrimmageY,
  minimapPlayerDot,
  minimapViewportRect,
  type Camera,
  type CameraFrame,
} from "@chalk/editor";
import { useRef, type PointerEvent } from "react";

/**
 * The original's navigator — a 132×82 map of the field, only live when
 * there is something off screen to find. A press centres the camera on
 * that point of the frame; a drag keeps doing so.
 */
export function FieldMinimap({
  camera,
  frame,
  onCamera,
  players,
}: {
  camera: Camera;
  frame: CameraFrame;
  onCamera: (camera: Camera) => void;
  players: readonly Player[];
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef(false);
  const shown = minimapIsShown(camera, frame);
  const viewport = minimapViewportRect(camera);
  const lineY = minimapLineOfScrimmageY();

  const panTo = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0) return;
    const at = minimapFramePoint(
      { x: event.clientX, y: event.clientY },
      bounds,
      frame,
    );
    onCamera(centreCamera(camera, at, frame));
  };

  return (
    <div className="minimap" data-shown={shown ? "true" : "false"}>
      <svg
        aria-hidden={!shown}
        aria-label="Field navigator"
        height={MINIMAP_SIZE.height}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        onPointerDown={(event) => {
          if (!shown) return;
          event.stopPropagation();
          dragging.current = true;
          svgRef.current?.setPointerCapture(event.pointerId);
          panTo(event);
        }}
        onPointerMove={(event) => {
          if (dragging.current) panTo(event);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        ref={svgRef}
        role="img"
        viewBox={`0 0 ${MINIMAP_SIZE.width} ${MINIMAP_SIZE.height}`}
        width={MINIMAP_SIZE.width}
      >
        <line
          stroke="#D4D4D4"
          strokeWidth={1}
          x1={3}
          x2={MINIMAP_SIZE.width - 3}
          y1={lineY}
          y2={lineY}
        />
        {players.map((player) => {
          const at = minimapPlayerDot(player.position);
          return (
            <circle
              cx={at.x}
              cy={at.y}
              fill={player.unit === "defense" ? "#A1A1A1" : "#171717"}
              key={player.id}
              r={2}
            />
          );
        })}
        <rect
          fill="none"
          height={viewport.height}
          stroke="#0072F5"
          strokeWidth={1}
          width={viewport.width}
          x={viewport.x}
          y={viewport.y}
        />
      </svg>
    </div>
  );
}
