import { PRODUCT_NAME, stickThunderPlay } from "@chalk/domain";
import {
  buildRenderScene,
  buildSvgRenderScene,
  type SvgRenderScene,
  type SvgScenePath,
} from "@chalk/render";
import { useState } from "react";

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
  red: "#ff3838",
  green: "#45a557",
  yellow: "#ffe500",
} as const;

const routeDashes: Record<SvgScenePath["style"]["line"], string | undefined> = {
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
  style: SvgScenePath["style"];
}) {
  const markerEnd =
    style.ending === "arrow" || style.ending === "dot"
      ? `url(#chalk-${style.ending}-${style.color})`
      : undefined;

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

function FieldDiagram({
  scene = stickThunderScene,
}: {
  scene?: SvgRenderScene;
}) {
  const yardLines = [0, 133, 267, 400, 534, 667, 801, 934, 1068];

  return (
    <svg
      className="field-diagram"
      role="img"
      aria-label="Stick — Thunder football play"
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
          </g>
        ))}
      </defs>
      <rect
        className="field-paper"
        height={scene.viewport.height}
        width={scene.viewport.width}
      />
      {yardLines.map((x) => (
        <line
          className="field-grid"
          key={x}
          x1={x}
          x2={x}
          y1="0"
          y2={scene.viewport.height}
        />
      ))}
      {[0, 65, 131, 197, 263, 328, 394, 459, 525].map((y) => (
        <line
          className="field-grid"
          key={y}
          x1="0"
          x2={scene.viewport.width}
          y1={y}
          y2={y}
        />
      ))}
      {[155, 715].map((x) =>
        Array.from({ length: 20 }, (_, index) => (
          <line
            className="hash"
            key={`${x}-${index}`}
            x1={x}
            x2={x + 13}
            y1={index * 26}
            y2={index * 26}
          />
        )),
      )}
      <line
        className="line-of-scrimmage"
        x1="0"
        x2={scene.viewport.width}
        y1={scene.viewport.lineOfScrimmageY}
        y2={scene.viewport.lineOfScrimmageY}
      />
      <g className="yard-numbers">
        <text x="140" y="18">
          30
        </text>
        <text x="890" y="18">
          30
        </text>
        <text x="140" y="150">
          20
        </text>
        <text x="890" y="150">
          20
        </text>
        <text x="140" y="280">
          10
        </text>
        <text x="890" y="280">
          10
        </text>
        <text x="140" y="516">
          10
        </text>
        <text x="890" y="516">
          10
        </text>
      </g>
      <g className="routes">
        {scene.paths.map((path) => (
          <g key={path.id}>
            <RoutePath d={path.d} id={path.id} style={path.style} />
            {path.ticks.map((tick, index) => (
              <line
                data-scene-tick={`${path.id}-${index}`}
                key={`${path.id}-tick-${index}`}
                stroke={sceneColors[path.style.color]}
                strokeLinecap="round"
                strokeWidth="2.5"
                {...tick}
              />
            ))}
            {path.branches.map((branch) => (
              <RoutePath
                d={branch.d}
                id={branch.id}
                key={branch.id}
                style={branch.style}
              />
            ))}
          </g>
        ))}
      </g>
      <g className="field-annotations">
        {scene.labels.map((label) => {
          const text = label.text;
          const width = Math.max(20, text.length * label.size * 0.6) + 14;
          const height = label.size + 10;
          const boxColor = sceneColors[label.boxColor];

          return (
            <g data-scene-label={label.id} key={label.id}>
              {label.box !== "none" ? (
                <rect
                  fill={label.box === "fill" ? boxColor : "#fff"}
                  height={height}
                  rx="2"
                  stroke={label.box === "outline" ? boxColor : "none"}
                  strokeWidth="1.6"
                  width={width}
                  x={label.position.x - width / 2}
                  y={label.position.y - label.size - 4}
                />
              ) : null}
              <text
                className={label.color === "blue" ? "read" : undefined}
                fill={sceneColors[label.color]}
                fontSize={label.size}
                fontWeight="500"
                textAnchor="middle"
                x={label.position.x}
                y={label.position.y}
              >
                {text}
              </text>
            </g>
          );
        })}
      </g>
      <g className="players">
        {scene.players.map((player) => (
          <g
            data-scene-player={player.id}
            key={player.id}
            transform={`translate(${player.position.x} ${player.position.y})`}
          >
            {player.symbol === "circle" ? <circle r="14" /> : null}
            {player.symbol === "square" ? (
              <rect height="27" width="27" x="-13.5" y="-13.5" />
            ) : null}
            {player.label ? (
              <text className="player-label" y="4">
                {player.label}
              </text>
            ) : null}
            {player.sublabel ? (
              <text className="player-note" y="36">
                {player.sublabel.toUpperCase()}
              </text>
            ) : null}
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
          get their job, mirrored to the side they line up on.
        </p>
      </InspectorSection>
      <InspectorSection title="Defense">
        <button className="wide-picker">
          <span>No defense yet</span>
          <span>– &nbsp;›</span>
        </button>
        <p>
          Each call replaces the last one and leaves the offense untouched. Just
          the front and secondary — letter symbols only.
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

export function ChalkApp() {
  const [activeView, setActiveView] = useState<View>("Editor");
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [playName, setPlayName] = useState("Stick — Thunder");
  const [saveLabel, setSaveLabel] = useState("Save");

  const save = () => {
    setSaveLabel("Saved");
    window.setTimeout(() => setSaveLabel("Save"), 900);
  };

  if (activeView !== "Editor") {
    return (
      <div className={`chalk-shell view-${activeView.toLowerCase()}`}>
        <Header
          activeView={activeView}
          onView={setActiveView}
          playName={playName}
          setPlayName={setPlayName}
          onSave={save}
          saveLabel={saveLabel}
        />
        <div className="mode-placeholder">
          <FieldDiagram />
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
        playName={playName}
        setPlayName={setPlayName}
        onSave={save}
        saveLabel={saveLabel}
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
          <div className="field-wrap">
            <FieldDiagram />
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
              11P · 5R &nbsp;&nbsp; saved
            </span>
          </div>
        </main>
        <Inspector />
      </div>
    </div>
  );
}

function Header({
  activeView,
  onView,
  onSave,
  playName,
  saveLabel,
  setPlayName,
}: {
  activeView: View;
  onView: (view: View) => void;
  onSave: () => void;
  playName: string;
  saveLabel: string;
  setPlayName: (name: string) => void;
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
        onChange={(event) => setPlayName(event.target.value)}
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
      <button className="quiet" disabled>
        Undo
      </button>
      <button className="quiet" disabled>
        Redo
      </button>
      <span className="divider" />
      <button className="more" aria-label="More actions">
        ⋯
      </button>
      <button className="export">Export</button>
      <button
        className={`save ${saveLabel === "Saved" ? "saved" : ""}`}
        onClick={onSave}
      >
        {saveLabel}
      </button>
    </header>
  );
}
