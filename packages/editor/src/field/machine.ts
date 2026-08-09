import {
  NEW_LABEL_DEFAULTS,
  type PlayCommand,
  type PlayDocument,
} from "@chalk/domain";

import { buildDeleteCommand, buildMoveCommand, movePreview } from "./commands";
import {
  buildMirrorCommand,
  buildPasteCommand,
  copySelection,
} from "./clipboard";
import {
  addDrawPoint,
  bendLastSegment,
  buildDrawCommand,
  clearDrawing,
  drawTarget,
  startDrawing,
} from "./drawing";
import {
  clampToField,
  coordinate,
  fieldHitOptions,
  hitTestField,
  isSelected,
  marqueeHits,
  nearestSegmentIndex,
  sameItem,
  screenDistancePx,
} from "./geometry";
import { editHandle, handleLabels } from "./handles";
import {
  DRAW_CURVE_THRESHOLD_PX,
  MARQUEE_THRESHOLD_PX,
  MOVE_THRESHOLD_PX,
  type FieldGesture,
  type FieldInteractionContext,
  type FieldInteractionEvent,
  type FieldInteractionModel,
  type FieldInteractionResult,
  type FieldItemRef,
  type FieldPointerInput,
} from "./model";

/**
 * One state machine turns pointer and keyboard input from any modality into
 * the same selection changes and PlayCommands (ADR 0016). Nothing here
 * touches the EditorStore: a gesture previews out of this model and commits
 * exactly one command when it completes.
 */

function withGesture(
  model: FieldInteractionModel,
  gesture: FieldGesture,
): FieldInteractionModel {
  return { ...model, gesture };
}

function withSelection(
  model: FieldInteractionModel,
  selection: readonly FieldItemRef[],
): FieldInteractionModel {
  return { ...model, selection, gesture: { kind: "idle" } };
}

function pointerDown(
  model: FieldInteractionModel,
  input: FieldPointerInput,
  context: FieldInteractionContext,
): FieldInteractionResult {
  // One gesture at a time; a second finger neither pans nor breaks the first.
  if (model.gesture.kind !== "idle") return { model };
  if (input.button !== undefined && input.button !== 0) return { model };

  // Mid-drawing, every press places the next break — even over a Player.
  if (model.drawing) {
    return { model: addDrawPoint(model, model.drawing, input, context) };
  }

  const found = hitTestField(
    context.scene,
    input.point,
    context.screenScale,
    fieldHitOptions(input.pointerType),
  );
  const hit = found?.item;

  if (
    context.tool === "route" ||
    context.tool === "motion" ||
    context.tool === "block" ||
    context.tool === "zone"
  ) {
    // The original also starts unattached routes from grass; the production
    // schema still requires a Player on every path, so until a schema
    // revision admits unattached routes, grass presses draw nothing.
    if (hit?.kind !== "player") return { model };
    return {
      model: startDrawing(context.tool, hit.id, context) ?? model,
    };
  }

  if (hit) {
    if (input.shiftKey) {
      // Shift settles membership on the press itself; no drag follows.
      return {
        model: withSelection(
          model,
          isSelected(model.selection, hit)
            ? model.selection.filter((item) => !sameItem(item, hit))
            : [...model.selection, hit],
        ),
      };
    }
    const already = isSelected(model.selection, hit);
    const wasMulti = already && model.selection.length > 1;
    const items = wasMulti ? model.selection : [hit];
    return {
      model: {
        ...model,
        selection: already ? model.selection : [hit],
        // Picking something new starts it whole: the line and break the
        // Coach was working on belonged to what he just left.
        ...(already
          ? {}
          : {
              selectedBranchIndex: undefined,
              selectedSegmentIndex: undefined,
              selectedNodeIndex: undefined,
            }),
        gesture: {
          kind: "pressing",
          pointerId: input.pointerId,
          items,
          clickItem: hit,
          wasMulti,
          wasSingle: already && model.selection.length === 1,
          start: input.point,
          ...(found?.branchIndex === undefined
            ? {}
            : { hitBranchIndex: found.branchIndex }),
        },
      },
    };
  }

  if (context.tool === "text") {
    const createId = context.createId ?? ((prefix: string) => `${prefix}_new`);
    const id = createId("label");
    // A new note belongs to whichever unit the Coach was working on: the
    // side of the selected Player, not where on the field he pressed —
    // depth notes and progression numbers live downfield too.
    const selectedPlayer = context.document.players.find((player) =>
      model.selection.some(
        (item) => item.kind === "player" && item.id === player.id,
      ),
    );
    return {
      model: withSelection(model, [{ kind: "label", id }]),
      command: {
        kind: "batch",
        label: "Add label",
        commands: [
          {
            kind: "insert-labels",
            labels: [
              {
                index: context.document.labels.length,
                item: {
                  id,
                  position: coordinate(
                    input.point.lateralYards,
                    input.point.depthYards,
                  ),
                  ...NEW_LABEL_DEFAULTS,
                  ...(selectedPlayer?.unit === "defense"
                    ? { unit: "defense" as const }
                    : {}),
                },
              },
            ],
          },
        ],
      },
      requestedTool: "select",
      editingLabelId: id,
    };
  }

  if (context.tool === "player") {
    // The original places the new man exactly where the Coach pressed.
    const createId = context.createId ?? ((prefix: string) => `${prefix}_new`);
    const id = createId("player");
    return {
      model: withSelection(model, [{ kind: "player", id }]),
      command: {
        kind: "batch",
        label: "Add Player",
        commands: [
          {
            kind: "insert-players",
            players: [
              {
                index: context.document.players.length,
                item: {
                  id,
                  unit: context.document.unit,
                  position: coordinate(
                    input.point.lateralYards,
                    input.point.depthYards,
                  ),
                  symbol: "circle",
                  label: "",
                  sublabel: "",
                  fill: "none",
                  color: "ink",
                },
              },
            ],
          },
        ],
      },
    };
  }

  return {
    model: withGesture(model, {
      kind: "marquee",
      pointerId: input.pointerId,
      anchor: input.point,
      corner: input.point,
      additive: input.shiftKey === true,
      active: false,
    }),
  };
}

function pointerMove(
  model: FieldInteractionModel,
  input: FieldPointerInput,
  context: FieldInteractionContext,
): FieldInteractionResult {
  const drawing = model.drawing;
  if (drawing && model.gesture.kind === "idle") {
    const last = drawing.points.at(-1)!;
    if (
      drawing.pointerDown &&
      drawing.points.length > 1 &&
      screenDistancePx(last, input.point, context.screenScale) >
        DRAW_CURVE_THRESHOLD_PX
    ) {
      return {
        model: { ...model, drawing: bendLastSegment(drawing, input.point) },
      };
    }
    return {
      model: {
        ...model,
        drawing: {
          ...drawing,
          cursor: drawTarget(drawing, input.point, input.shiftKey, context),
        },
      },
    };
  }

  const gesture = model.gesture;
  if (gesture.kind === "idle") return { model };
  if (gesture.pointerId !== input.pointerId) return { model };

  if (gesture.kind === "pressing") {
    if (
      screenDistancePx(gesture.start, input.point, context.screenScale) <
      MOVE_THRESHOLD_PX
    ) {
      return { model };
    }
    const preview = movePreview(
      context,
      gesture.items,
      gesture.start,
      input.point,
    );
    return {
      model: withGesture(model, {
        kind: "moving",
        pointerId: gesture.pointerId,
        items: gesture.items,
        start: gesture.start,
        ...preview,
      }),
    };
  }

  if (gesture.kind === "moving") {
    const preview = movePreview(
      context,
      gesture.items,
      gesture.start,
      input.point,
    );
    return {
      model: withGesture(model, { ...gesture, ...preview }),
    };
  }

  if (gesture.kind === "handle") {
    const edit = editHandle(
      context,
      gesture.handle,
      input.point,
      input.shiftKey,
    );
    if (!edit) return { model };
    return {
      model: withGesture(model, { ...gesture, ...edit, moved: true }),
    };
  }

  const active =
    gesture.active ||
    screenDistancePx(gesture.anchor, input.point, context.screenScale) >
      MARQUEE_THRESHOLD_PX;
  return {
    model: withGesture(model, { ...gesture, corner: input.point, active }),
  };
}

function pointerUp(
  model: FieldInteractionModel,
  input: FieldPointerInput,
  context: FieldInteractionContext,
): FieldInteractionResult {
  if (model.drawing?.pointerDown) {
    // Releasing keeps the drawing alive; the next press places the next break.
    return {
      model: { ...model, drawing: { ...model.drawing, pointerDown: false } },
    };
  }

  const gesture = model.gesture;
  if (gesture.kind === "idle") return { model };
  if (gesture.pointerId !== input.pointerId) return { model };

  if (gesture.kind === "pressing") {
    // A press that never moved is a click. On a multi-selection it narrows to
    // the item under the pointer, exactly as the original did.
    if (gesture.wasMulti) {
      return { model: withSelection(model, [gesture.clickItem]) };
    }
    // A click on a route already selected on its own narrows to the line the
    // Coach pointed at: a branch if he pointed at one, otherwise the segment
    // of the main line nearest his press. This is how the original let a
    // Coach reach one piece of a route without a second control.
    if (gesture.clickItem.kind === "path" && gesture.wasSingle) {
      const path = context.document.paths.find(
        ({ id }) => id === gesture.clickItem.id,
      );
      if (gesture.hitBranchIndex !== undefined) {
        return {
          model: {
            ...withGesture(model, { kind: "idle" }),
            selectedBranchIndex: gesture.hitBranchIndex,
            selectedSegmentIndex: undefined,
            selectedNodeIndex: undefined,
          },
        };
      }
      if (
        path &&
        model.selectedBranchIndex === undefined &&
        path.points.length > 2
      ) {
        return {
          model: {
            ...withGesture(model, { kind: "idle" }),
            selectedSegmentIndex: nearestSegmentIndex(
              path,
              gesture.start,
              context.screenScale,
            ),
          },
        };
      }
    }
    return { model: withGesture(model, { kind: "idle" }) };
  }

  if (gesture.kind === "moving") {
    const command = buildMoveCommand(
      context.document,
      gesture.items,
      gesture.translation,
    );
    return {
      model: withGesture(model, { kind: "idle" }),
      ...(command === undefined ? {} : { command }),
    };
  }

  if (gesture.kind === "handle") {
    // A handle pressed but never dragged only selected its break.
    return {
      model: withGesture(model, { kind: "idle" }),
      ...(gesture.moved
        ? {
            command: {
              kind: "batch",
              label: handleLabels[gesture.handle.kind],
              commands: [gesture.update],
            } satisfies PlayCommand,
          }
        : {}),
    };
  }

  if (!gesture.active) {
    // A click on empty grass clears the selection; with Shift held it keeps it.
    return {
      model: gesture.additive
        ? withGesture(model, { kind: "idle" })
        : withSelection(model, []),
    };
  }
  const hits = marqueeHits(context.scene, gesture.anchor, gesture.corner);
  const selection = gesture.additive
    ? [
        ...model.selection,
        ...hits.filter((hit) => !isSelected(model.selection, hit)),
      ]
    : hits;
  return { model: withSelection(model, selection) };
}

export function fieldInteraction(
  model: FieldInteractionModel,
  event: FieldInteractionEvent,
  context: FieldInteractionContext,
): FieldInteractionResult {
  switch (event.type) {
    case "pointer-down":
      return pointerDown(model, event.input, context);
    case "pointer-move":
      return pointerMove(model, event.input, context);
    case "pointer-up":
      return pointerUp(model, event.input, context);
    case "pointer-cancel":
      // The platform took the pointer (palm, system gesture). Nothing was
      // committed mid-gesture, so dropping the gesture is a clean revert; a
      // drawing survives — only its held pointer is released.
      return {
        model: {
          ...withGesture(model, { kind: "idle" }),
          ...(model.drawing === undefined
            ? {}
            : { drawing: { ...model.drawing, pointerDown: false } }),
        },
      };
    case "escape": {
      // Escape steps outward: the drawing, then the gesture, then the
      // selection — the original's ladder.
      if (model.drawing) {
        return { model: clearDrawing(model) };
      }
      if (model.gesture.kind !== "idle") {
        return { model: withGesture(model, { kind: "idle" }) };
      }
      return model.selection.length > 0
        ? { model: withSelection(model, []) }
        : { model };
    }
    case "delete": {
      const drawing = model.drawing;
      if (drawing) {
        // Backspace edits the drawing before it deletes anything: the typed
        // depth first, then the last break, then the drawing itself.
        if (drawing.depthBuffer !== "") {
          return {
            model: {
              ...model,
              drawing: {
                ...drawing,
                depthBuffer: drawing.depthBuffer.slice(0, -1),
              },
            },
          };
        }
        if (drawing.points.length > 1) {
          return {
            model: {
              ...model,
              drawing: { ...drawing, points: drawing.points.slice(0, -1) },
            },
          };
        }
        return { model: clearDrawing(model) };
      }
      if (model.selection.length === 0) return { model };
      const command = buildDeleteCommand(context.document, model.selection);
      return {
        model: withSelection(model, []),
        ...(command === undefined ? {} : { command }),
      };
    }
    case "select-all":
      return {
        model: withSelection(model, [
          ...context.document.players.map(
            ({ id }) => ({ kind: "player", id }) as const,
          ),
          ...context.document.paths.map(
            ({ id }) => ({ kind: "path", id }) as const,
          ),
          ...context.document.labels.map(
            ({ id }) => ({ kind: "label", id }) as const,
          ),
        ]),
      };
    case "nudge": {
      // The original had no keyboard nudge; ADR 0016 requires a keyboard
      // alternative to dragging, so each press is its own small, undoable move.
      if (model.selection.length === 0) return { model };
      const command = buildMoveCommand(
        context.document,
        model.selection,
        coordinate(event.lateralYards, event.depthYards),
      );
      return { model, ...(command === undefined ? {} : { command }) };
    }
    case "start-route": {
      if (model.drawing || model.gesture.kind !== "idle") return { model };
      const started = startDrawing("route", event.playerId, context);
      return { model: started ?? model };
    }
    case "finish-drawing": {
      const drawing = model.drawing;
      if (!drawing) return { model };
      const createId =
        context.createId ?? ((prefix: string) => `${prefix}_new`);
      const pathId = createId("path");
      const command = buildDrawCommand(context, drawing, pathId);
      if (command === undefined) return { model: clearDrawing(model) };
      return {
        model: {
          selection: [{ kind: "path", id: pathId }],
          gesture: { kind: "idle" },
        },
        command,
        requestedTool: "select",
      };
    }
    case "handle-down": {
      if (model.drawing || model.gesture.kind !== "idle") return { model };
      const handle = event.handle;
      // A leader is seeded from where it already points, so a press that
      // never moves leaves it exactly where it was.
      const seedPoint =
        handle.kind === "leader"
          ? (context.document.labels.find(({ id }) => id === handle.labelId)
              ?.leader?.endpoint ?? event.input.point)
          : event.input.point;
      const seed = editHandle(context, handle, seedPoint, event.input.shiftKey);
      if (!seed) return { model };
      const owner: FieldItemRef =
        handle.kind === "leader"
          ? { kind: "label", id: handle.labelId }
          : { kind: "path", id: handle.pathId };
      return {
        model: {
          ...model,
          // The route or label stays selected; a node press picks its break.
          selection: [owner],
          ...(handle.kind === "node"
            ? { selectedNodeIndex: handle.pointIndex }
            : {}),
          gesture: {
            kind: "handle",
            pointerId: event.input.pointerId,
            handle,
            update: seed.update,
            guides: [],
            moved: false,
          },
        },
      };
    }
    case "insert-node": {
      const path = context.document.paths.find(({ id }) => id === event.pathId);
      if (!path || path.points.length < 2) return { model };
      const index = nearestSegmentIndex(path, event.point, context.screenScale);
      const points = [...path.points];
      points.splice(index, 0, {
        lateralYards: coordinate(
          event.point.lateralYards,
          event.point.depthYards,
        ).lateralYards,
        depthYards: coordinate(event.point.lateralYards, event.point.depthYards)
          .depthYards,
      });
      return {
        model: {
          ...model,
          selection: [{ kind: "path", id: path.id }],
          selectedNodeIndex: index,
          gesture: { kind: "idle" },
        },
        command: {
          kind: "batch",
          label: "Add route break",
          commands: [{ kind: "update-path", path: { ...path, points } }],
        },
      };
    }
    case "point-at": {
      // What he already picked stays picked, so asking about one of several
      // does not throw the rest away; anything else becomes the selection on
      // its own. Whatever was in flight is abandoned — he has stopped to look.
      const settled = isSelected(model.selection, event.item)
        ? model.selection
        : [event.item];
      return {
        model: { ...withSelection(model, settled), drawing: undefined },
      };
    }
    case "copy": {
      const clipboard = copySelection(context.document, model.selection);
      return { model: clipboard ? { ...model, clipboard } : model };
    }
    case "paste":
    case "duplicate": {
      // Duplicate is a copy and a paste in one press, so it neither reads
      // nor disturbs whatever the Coach has on the clipboard.
      const source =
        event.type === "duplicate"
          ? copySelection(context.document, model.selection)
          : model.clipboard;
      if (!source) return { model };
      const createId =
        context.createId ?? ((prefix: string) => `${prefix}_new`);
      const pasted = buildPasteCommand(context.document, source, createId);
      if (!pasted) return { model };
      return {
        model: {
          ...model,
          selection: pasted.selection,
          gesture: { kind: "idle" },
        },
        command: pasted.command,
      };
    }
    case "mirror": {
      const command = buildMirrorCommand(context.document, model.selection);
      return { model, ...(command === undefined ? {} : { command }) };
    }
    case "depth-digit": {
      const drawing = model.drawing;
      if (!drawing || !/^[0-9.]$/.test(event.digit)) return { model };
      const depthBuffer = drawing.depthBuffer + event.digit;
      const typed = Number.parseFloat(depthBuffer);
      return {
        model: {
          ...model,
          drawing: {
            ...drawing,
            depthBuffer,
            cursor: Number.isNaN(typed)
              ? drawing.cursor
              : clampToField(
                  coordinate(drawing.cursor.lateralYards, typed),
                  context,
                ),
          },
        },
      };
    }
  }
}
/**
 * The transient preview is the commit builder run early: what the Coach sees
 * mid-drag is exactly the document the release would produce.
 */
export function gesturePreviewCommand(
  model: FieldInteractionModel,
  document: PlayDocument,
): PlayCommand | undefined {
  if (model.gesture.kind === "moving") {
    return buildMoveCommand(
      document,
      model.gesture.items,
      model.gesture.translation,
    );
  }
  if (model.gesture.kind === "handle" && model.gesture.moved) {
    return {
      kind: "batch",
      label: handleLabels[model.gesture.handle.kind],
      commands: [model.gesture.update],
    };
  }
  return undefined;
}

/**
 * After an undo, redo, or restore the document may no longer contain what was
 * selected. Selection quietly narrows to what still exists, and any in-flight
 * gesture that references a vanished item is abandoned.
 *
 * `pendingIds` are entities a command has created but whose commit has not
 * landed yet. Without them a Player, route, or note would be deselected in
 * the instant between the Coach making it and the save arriving — absent
 * because it is still on its way, not because an undo took it.
 */
export function pruneFieldSelection(
  model: FieldInteractionModel,
  document: PlayDocument,
  pendingIds: ReadonlySet<string> = new Set(),
): FieldInteractionModel {
  const exists = (item: FieldItemRef): boolean => {
    if (pendingIds.has(item.id)) return true;
    switch (item.kind) {
      case "player":
        return document.players.some(({ id }) => id === item.id);
      case "path":
        return document.paths.some(({ id }) => id === item.id);
      case "label":
        return document.labels.some(({ id }) => id === item.id);
    }
  };
  const selection = model.selection.filter(exists);
  const gestureItems =
    model.gesture.kind === "pressing" || model.gesture.kind === "moving"
      ? model.gesture.items
      : [];
  const gesture: FieldGesture = gestureItems.every(exists)
    ? model.gesture
    : { kind: "idle" };
  // A route being drawn from a Player an undo removed has nothing to attach
  // to, so it is abandoned rather than left pointing at a ghost.
  const drawing =
    model.drawing && exists({ kind: "player", id: model.drawing.playerId })
      ? model.drawing
      : undefined;
  if (
    selection.length === model.selection.length &&
    gesture === model.gesture &&
    drawing === model.drawing
  ) {
    return model;
  }
  // Spread rather than rebuilt: the line and break the Coach narrowed to
  // survive an edit to the very thing he narrowed to, so he can make two
  // changes to one segment in a row.
  return {
    ...model,
    selection,
    gesture,
    ...(drawing === undefined ? { drawing: undefined } : { drawing }),
  };
}
