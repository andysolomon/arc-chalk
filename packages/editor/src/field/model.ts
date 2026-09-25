import type {
  Coordinate,
  MovementPath,
  PathPoint,
  PlayCommand,
  PlayDocument,
  Player,
  PrimitivePlayCommand,
  TextLabel,
} from "@chalk/domain";
import type { RenderScene } from "@chalk/render";

import type {
  AxisSnapGuide,
  SnapScreenScale,
  SnapSettings,
} from "../smart-snapping";

/**
 * The vocabulary of field interaction: what can be selected, what a gesture
 * is, and what the machine is told. Everything here is data — the rules that
 * act on it live in the modules beside this one.
 */

export interface FieldItemRef {
  readonly kind: "player" | "path" | "label";
  readonly id: string;
}

export interface FieldPointerInput {
  /** Pointer location in yard space, already unprojected by the shell. */
  readonly point: Coordinate;
  readonly pointerId: number;
  readonly shiftKey?: boolean;
  readonly button?: number;
  /** "touch" widens hit targets to the 44 CSS px minimum (ADR 0016). */
  readonly pointerType?: string;
}

export type FieldInteractionEvent =
  | { readonly type: "pointer-down"; readonly input: FieldPointerInput }
  | { readonly type: "pointer-move"; readonly input: FieldPointerInput }
  | { readonly type: "pointer-up"; readonly input: FieldPointerInput }
  | { readonly type: "pointer-cancel" }
  | { readonly type: "escape" }
  | { readonly type: "delete" }
  | { readonly type: "select-all" }
  | {
      readonly type: "nudge";
      readonly lateralYards: number;
      readonly depthYards: number;
    }
  | {
      /**
       * The blue dot above a Player. The drag's direction, measured from the
       * press, is the direction the route leaves his stance — the dot sits
       * upfield only so it can be grabbed.
       */
      readonly type: "start-route";
      readonly playerId: string;
      readonly input?: FieldPointerInput;
      readonly mode?: FieldDrawingMode;
    }
  | {
      /**
       * The inspector's Draw buttons and the R M B Z keys: start a line of
       * this kind from a Player's stance, the breaks to follow by pointer.
       */
      readonly type: "start-drawing";
      readonly kind: FieldDrawingKind;
      readonly playerId: string;
      readonly mode?: FieldDrawingMode;
    }
  | { readonly type: "finish-drawing" }
  | {
      /** The Coach switches between clicking breaks and tracing mid-line. */
      readonly type: "set-drawing-mode";
      readonly mode: FieldDrawingMode;
    }
  | {
      /** A typed digit sets the exact depth of the next break. */
      readonly type: "depth-digit";
      readonly digit: string;
    }
  | {
      readonly type: "handle-down";
      readonly handle: FieldHandleRef;
      readonly input: FieldPointerInput;
    }
  | {
      /** Double-clicking a route adds a break where the Coach pointed. */
      readonly type: "insert-node";
      readonly pathId: string;
      readonly point: Coordinate;
    }
  | {
      /**
       * The Coach has asked what he can do to this one — by right-click, by
       * long press, or by any other modality that arrives later. Settling the
       * selection is the model's answer; opening a menu is the shell's.
       */
      readonly type: "point-at";
      readonly item: FieldItemRef;
    }
  | { readonly type: "copy" }
  | { readonly type: "paste" }
  | { readonly type: "duplicate" }
  /** Reflects the selection, or the whole Play when nothing is selected. */
  | { readonly type: "mirror" };

export interface FieldMoveReadout {
  readonly position: Coordinate;
  readonly text: string;
}

/**
 * A handle on the selected route. Handles are drawn by the shell at a
 * constant screen size (ADR 0016), so the shell names the one that was
 * pressed rather than the machine hit-testing pixels it cannot see.
 */
export type FieldHandleRef =
  | {
      readonly kind: "node";
      readonly pathId: string;
      readonly pointIndex: number;
      /** Absent means the main line; otherwise the branch being edited. */
      readonly branchIndex?: number;
    }
  | {
      readonly kind: "control";
      readonly pathId: string;
      readonly pointIndex: number;
      readonly branchIndex?: number;
    }
  | { readonly kind: "zone"; readonly pathId: string }
  | { readonly kind: "leader"; readonly labelId: string };

export type FieldGesture =
  | { readonly kind: "idle" }
  | {
      /**
       * Pressed on an item; not a drag until the pointer clears 2 px, or a
       * finger's tap slop.
       */
      readonly kind: "pressing";
      readonly pointerId: number;
      readonly items: readonly FieldItemRef[];
      readonly clickItem: FieldItemRef;
      readonly wasMulti: boolean;
      /** It was already the only thing picked when this press began. */
      readonly wasSingle: boolean;
      readonly start: Coordinate;
      /** Which line of a route was under the press, if it was a branch. */
      readonly hitBranchIndex?: number;
    }
  | {
      readonly kind: "moving";
      readonly pointerId: number;
      readonly items: readonly FieldItemRef[];
      readonly start: Coordinate;
      /** What the commit will apply — snapped when one Player is moving. */
      readonly translation: Coordinate;
      readonly guides: readonly AxisSnapGuide[];
      readonly readout?: FieldMoveReadout;
    }
  | {
      readonly kind: "marquee";
      readonly pointerId: number;
      readonly anchor: Coordinate;
      readonly corner: Coordinate;
      readonly additive: boolean;
      /** False until the pointer clears 3 px, so a click is not a marquee. */
      readonly active: boolean;
    }
  | {
      /** Dragging a node, curve, or zone handle on the selected route. */
      readonly kind: "handle";
      readonly pointerId: number;
      readonly handle: FieldHandleRef;
      /** The edit as it stands — exactly what a release would commit. */
      readonly update: PrimitivePlayCommand;
      readonly guides: readonly AxisSnapGuide[];
      readonly readout?: FieldMoveReadout;
      readonly moved: boolean;
    };

/**
 * What a drawing tool lays down. The Block tool draws a block on an offensive
 * player and a blitz path on a defender — the same press, named for what it
 * does to the man it starts from (issue #65).
 */
export type FieldDrawingKind = "route" | "motion" | "block" | "zone" | "blitz";

/**
 * How the Coach lays a line down. With breaks, each press places one; the
 * line between is straight, or bent by holding the press — and a drag off
 * the blue dot or off the end of the line is traced where the hand goes,
 * the line staying in hand for the next break. Free, every press traces:
 * the line follows the pointer while it is held down and is finished the
 * moment it lifts, the way a pen leaves the whiteboard.
 */
export type FieldDrawingMode = "breaks" | "free";

/**
 * A point of the line in hand. A traced point is one the pointer passed over
 * while tracing; the finish fits a clean line through those, where a clicked
 * break is kept exactly where it was put.
 */
export interface FieldDrawingPoint extends PathPoint {
  readonly traced?: boolean;
}

/**
 * An in-progress route. Drawing spans several presses — start on a Player,
 * click each break, finish on Enter, Done or a double click — so it lives
 * beside the single-pointer gesture rather than inside it. Nothing is
 * committed until the finish produces one insert command.
 */
export interface FieldDrawingState {
  readonly kind: FieldDrawingKind;
  readonly playerId: string;
  readonly mode: FieldDrawingMode;
  readonly points: readonly FieldDrawingPoint[];
  /** The 45°-constrained preview endpoint the dashed line runs to. */
  readonly cursor: Coordinate;
  /** Typed digits waiting to become the next break's exact depth. */
  readonly depthBuffer: string;
  /** True while the pointer is held after placing a break — dragging bends it. */
  readonly pointerDown: boolean;
  /** The initial blue-dot drag places a break on release, not on press. */
  readonly initialDrag?: FieldPointerInput | undefined;
  /**
   * While a held pointer is tracing, the index of the point its stroke set
   * out from; absent between strokes. It is how a stroke lifted in breaks
   * mode is told apart from the line it continues.
   */
  readonly strokeFrom?: number | undefined;
}

/**
 * What the Coach last copied. It is transient editor state rather than part
 * of the Play, and it holds whole entities so a paste survives edits to the
 * originals — or their deletion.
 */
export interface FieldClipboard {
  readonly players: readonly Player[];
  readonly paths: readonly MovementPath[];
  readonly labels: readonly TextLabel[];
}

export interface FieldInteractionModel {
  readonly selection: readonly FieldItemRef[];
  readonly gesture: FieldGesture;
  readonly drawing?: FieldDrawingState;
  /** Which break of the selected route the Coach last touched. */
  readonly selectedNodeIndex?: number;
  /**
   * Which line of the selected route he is working on: a branch by index, or
   * the main line when absent. Handles and breaks are read against it.
   */
  readonly selectedBranchIndex?: number;
  /** Which segment of that line is picked out, if he narrowed to one. */
  readonly selectedSegmentIndex?: number;
  readonly clipboard?: FieldClipboard;
}

export interface FieldInteractionContext {
  readonly document: PlayDocument;
  /**
   * The same scene the shell is rendering. Hit testing reads it instead of
   * the document so a label bound to a route is hit where it is drawn.
   */
  readonly scene: RenderScene;
  readonly screenScale: SnapScreenScale;
  readonly snap: SnapSettings;
  /**
   * Select is the field's one standing mode; Text places a note. Lines are
   * given to a selected Player from the inspector, the keys, or the blue
   * dot, never from a rail tool — see ADR 0052.
   */
  readonly tool: "select" | "text";
  /** The drawn frame's depth extents, so a route cannot leave the page. */
  readonly depthWindow?: {
    readonly minDepthYards: number;
    readonly maxDepthYards: number;
  };
  readonly createId?: (prefix: string) => string;
}

export interface FieldInteractionResult {
  readonly model: FieldInteractionModel;
  /** At most one command, produced only when a gesture completes. */
  readonly command?: PlayCommand;
  /** Finishing a route hands the Coach back the select tool. */
  readonly requestedTool?: "select";
  /** A label the Coach should be typing into the moment it appears. */
  readonly editingLabelId?: string;
}

export const idleFieldInteraction: FieldInteractionModel = {
  selection: [],
  gesture: { kind: "idle" },
};

/**
 * The original's gesture grammar in canvas pixels: 2 px before a press
 * becomes a drag, 3 px before a press on grass becomes a marquee, breaks at
 * least 4 px apart, and a held pointer bends the segment past 7 px. A traced
 * line samples the pointer every 2 px, close enough that the fit sees every
 * cut the hand made.
 */
export const MOVE_THRESHOLD_PX = 2;
export const MARQUEE_THRESHOLD_PX = 3;
export const DRAW_POINT_MIN_PX = 4;
export const DRAW_CURVE_THRESHOLD_PX = 7;
export const TRACE_POINT_MIN_PX = 2;

/**
 * How far a finger may wander between landing and lifting and still have
 * tapped. A fingertip is not a mouse: it rolls a few pixels on the way down
 * and on the way up, and the two pixels that suit a mouse or a Pencil would
 * turn most taps into the smallest possible drag — of the man pressed, or of
 * the field when it was the grass.
 */
export const FINGER_TAP_SLOP_PX = 10;

/** How far a press travels before it is a drag, for what is pressing. */
export function moveThresholdPx(pointerType?: string): number {
  return pointerType === "touch" ? FINGER_TAP_SLOP_PX : MOVE_THRESHOLD_PX;
}
