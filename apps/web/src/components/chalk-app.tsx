import { PRODUCT_NAME, stickThunderPlay } from "@chalk/domain";
import {
  localSaveMessage,
  localSaveStatus,
  type EditorUndoState,
  type EditorVersionSummary,
} from "@chalk/editor";
import {
  buildRenderScene,
  buildSvgRenderScene,
  type SvgRenderScene,
  type SvgPathStroke,
  type SvgShapePrimitive,
  type SvgTextPrimitive,
} from "@chalk/render";
import { useMemo, useState, useSyncExternalStore } from "react";

import type { ChalkRuntime } from "../app/editor-runtime";

type View = "Editor" | "Demo" | "Present" | "Print";
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

export function FieldDiagram({
  scene = stickThunderScene,
}: {
  scene?: SvgRenderScene;
}) {
  return (
    <svg
      className="field-diagram"
      role="img"
      aria-label={`${scene.playName} football play`}
      viewBox={`0 0 ${scene.viewport.width} ${scene.viewport.height}`}
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
          </g>
        ))}
      </g>
      <g className="players">
        {scene.players.map((player) => (
          <g
            aria-label={player.ariaLabel}
            data-scene-player={player.id}
            key={player.id}
            role="img"
            transform={`translate(${player.position.x} ${player.position.y})`}
          >
            <title>{player.ariaLabel}</title>
            {player.shapes.map((shape, index) => (
              <SceneShape key={`${player.id}-shape-${index}`} shape={shape} />
            ))}
            {player.texts.map((text, index) => (
              <SceneText key={`${player.id}-text-${index}`} text={text} />
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
}

function Inspector() {
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
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  const [freedStorage, setFreedStorage] = useState<ChalkRuntime["storage"]>();
  // The runtime reports storage health; freeing space supersedes that reading.
  const storage = freedStorage ?? runtime.storage;
  const editor = useSyncExternalStore(
    editorStore.subscribe,
    editorStore.getSnapshot,
    editorStore.getSnapshot,
  );
  const scene = useMemo(
    () => buildSvgRenderScene(buildRenderScene(editor.document)),
    [editor.document],
  );
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

  if (activeView !== "Editor") {
    return (
      <div className={`chalk-shell view-${activeView.toLowerCase()}`}>
        <Header
          activeView={activeView}
          onView={setActiveView}
          playName={editor.draftPlayName}
          setPlayName={editorStore.setPlayNameDraft}
          resetPlayName={editorStore.resetPlayNameDraft}
          commitPlayName={commitPlayName}
          onUndo={undo}
          onRedo={redo}
          undo={editor.undo}
          versions={editor.versions}
          onCreateVersion={createVersion}
          onRestoreVersion={restoreVersion}
          runtime={runtime}
        />
        <div className="mode-placeholder">
          <FieldDiagram scene={scene} />
          <div className="mode-label">{activeView} mode</div>
        </div>
      </div>
    );
  }

  return (
    <div className="chalk-shell">
      <Header
        activeView={activeView}
        onView={setActiveView}
        playName={editor.draftPlayName}
        setPlayName={editorStore.setPlayNameDraft}
        resetPlayName={editorStore.resetPlayNameDraft}
        commitPlayName={commitPlayName}
        onUndo={undo}
        onRedo={redo}
        undo={editor.undo}
        versions={editor.versions}
        onCreateVersion={createVersion}
        onRestoreVersion={restoreVersion}
        runtime={runtime}
      />
      <div className="workspace">
        <nav className="tool-rail" aria-label="Drawing tools">
          {tools.map((tool) => (
            <button
              className={activeTool === tool.id ? "active" : ""}
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
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
          <button className="rail-collapse" aria-label="Hide the tools">
            ‹
          </button>
        </nav>
        <main className="editor-stage">
          <DeviceNotices
            onDismissRecovery={() => setRecoveryDismissed(true)}
            onReleaseStorage={releaseStorage}
            recovery={recoveryDismissed ? undefined : runtime.recovery}
            storage={storage}
          />
          <div className="field-wrap">
            <FieldDiagram scene={scene} />
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
              − &nbsp; 100% &nbsp; + &nbsp;&nbsp; SELECTION &nbsp;&nbsp; BALL
              &nbsp;&nbsp; CUSTOM ALIGNMENT &nbsp;&nbsp; SNAP ON &nbsp;&nbsp;
              11P · 5R &nbsp;&nbsp;
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
        <Inspector />
      </div>
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

/** Matches the original's Save menu: Save, Save as variant, Snapshot. */
/**
 * Matches the original's More menu. Backup is an approved production extension
 * (parity matrix line 75) and lives inside this menu rather than adding a
 * control to the original's header.
 */
function MoreMenu({ runtime }: { runtime: ChalkRuntime }) {
  const [open, setOpen] = useState(false);
  const entries: readonly { label: string; shortcut?: string }[] = [
    { label: "Focus mode", shortcut: "F" },
    { label: "Hide zone areas", shortcut: "⇧Z" },
    { label: "Mirror" },
    { label: "Flip strength" },
    { label: "New play" },
  ];

  return (
    <div className="menu more-menu">
      <button
        aria-expanded={open}
        aria-label="More actions"
        className="more"
        onClick={() => setOpen((shown) => !shown)}
        type="button"
      >
        ⋯
      </button>
      <div className="menu-panel" hidden={!open}>
        {entries.map(({ label, shortcut }) => (
          <button disabled key={label} type="button">
            <span>{label}</span>
            {shortcut ? <kbd>{shortcut}</kbd> : null}
          </button>
        ))}
        <BackupPanel runtime={runtime} />
      </div>
    </div>
  );
}

function SaveMenu({
  onCreateVersion,
  onRestoreVersion,
  versions,
}: {
  onCreateVersion: (label: string) => void;
  onRestoreVersion: (revisionId: string) => void;
  versions: readonly EditorVersionSummary[];
}) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [label, setLabel] = useState("");

  return (
    <div className="menu save-menu">
      <button
        aria-expanded={open}
        className="save"
        onClick={() => setOpen((shown) => !shown)}
        type="button"
      >
        Save
      </button>
      <div className="menu-panel" hidden={!open}>
        <button disabled type="button">
          <span>Save</span>
          <kbd>⌘S</kbd>
        </button>
        <button disabled type="button">
          <span>Save as variant</span>
        </button>
        <button onClick={() => setNaming(true)} type="button">
          <span>Snapshot</span>
        </button>
        {naming ? (
          <form
            className="snapshot-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!label.trim()) return;
              onCreateVersion(label);
              setLabel("");
              setNaming(false);
            }}
          >
            <input
              aria-label="Snapshot name"
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Game Plan Final"
              value={label}
            />
            <button disabled={!label.trim()} type="submit">
              Create version
            </button>
          </form>
        ) : null}
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
      </div>
    </div>
  );
}

function Header({
  activeView,
  commitPlayName,
  onView,
  onUndo,
  onRedo,
  onCreateVersion,
  onRestoreVersion,
  playName,
  resetPlayName,
  runtime,
  setPlayName,
  undo,
  versions,
}: {
  activeView: View;
  commitPlayName: () => void;
  onView: (view: View) => void;
  onUndo: () => void;
  onRedo: () => void;
  onCreateVersion: (label: string) => void;
  onRestoreVersion: (revisionId: string) => void;
  playName: string;
  runtime: ChalkRuntime;
  resetPlayName: () => void;
  setPlayName: (name: string) => void;
  undo: EditorUndoState;
  versions: readonly EditorVersionSummary[];
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
      <MoreMenu runtime={runtime} />
      <button className="export">Export</button>
      <SaveMenu
        onCreateVersion={onCreateVersion}
        onRestoreVersion={onRestoreVersion}
        versions={versions}
      />
    </header>
  );
}
