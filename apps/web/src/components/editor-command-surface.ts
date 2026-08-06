/**
 * The original prototype's five chrome overlays: the More menu, the Export
 * menu, the Save/version menu, the command palette, and the shortcut
 * reference. Their item lists, ordering, and copy are read from the original
 * and are the specification (ADR 0039) — changing a label here is a parity
 * change, not a wording preference.
 *
 * Actions are supplied by the shell rather than named here, so an entry the
 * production editor cannot yet run stays visible in the catalogue and is
 * plainly unavailable instead of pretending to work.
 */
export type ActionId =
  | "focus"
  | "showPanels"
  | "toggleZones"
  | "mirror"
  | "flipStrength"
  | "newPlay"
  | "toolSelect"
  | "toolPlayer"
  | "toolRoute"
  | "toolMotion"
  | "toolBlock"
  | "toolZone"
  | "toolText"
  | "toggleInspector"
  | "toggleRail"
  | "present"
  | "print"
  | "fitToSelection"
  | "toggleSnapping"
  | "fitField"
  | "zoomToSelection"
  | "centerBall"
  | "ballLeft"
  | "ballMiddle"
  | "ballRight"
  | "alignDepth"
  | "alignSplits"
  | "clearRoutesOffense"
  | "clearRoutesDefense"
  | "clearAllLines"
  | "clearOffense"
  | "clearDefense"
  | "clearText"
  | "clearField"
  | "savePlay"
  | "newVariation"
  | "group"
  | "ungroup"
  | "bringForward"
  | "sendBackward"
  | "reverseRoute"
  | "addDepthLabel"
  | "shortcuts"
  | "exportPng"
  | "exportSvg"
  | "printField"
  | "printInstall"
  | "printQuiz"
  | "printSlide"
  | "printProgression"
  | "exportFrames"
  | "printScout"
  | "printCards"
  | "printCallSheet"
  | "printPlaybook"
  | "printWristband"
  | "saveAsVariant"
  | "snapshot"
  | "positionReceivers"
  | "positionBacks"
  | "positionLine"
  | "positionQb"
  | "positionDefense"
  | `concept:${string}`;

/** What the shell can actually run right now; anything absent is unavailable. */
export type ActionMap = Partial<Record<ActionId, () => void>>;

export interface MenuEntry {
  readonly id: ActionId;
  readonly label: string;
  readonly shortcut?: string;
  readonly title?: string;
}

export const conceptNames = [
  "Mesh",
  "Stick",
  "Smash",
  "Flood",
  "Dagger",
  "Drive",
  "Y-Cross",
  "Levels",
  "Spacing",
  "4 Verts",
] as const;

interface ExportGroup {
  readonly head: string;
  readonly items: readonly (MenuEntry & {
    readonly submenu?: "position" | "wristband";
  })[];
}

/**
 * The seeded Play carries timed routes, so the original shows its two
 * animation exports. They are listed unconditionally because production's
 * seed always animates; a Play without timing would hide them.
 */
export const exportGroups: readonly ExportGroup[] = [
  {
    head: "DIAGRAM",
    items: [
      { id: "exportPng", label: "Download PNG" },
      { id: "exportSvg", label: "Download SVG" },
      { id: "printField", label: "Print the field" },
    ],
  },
  {
    head: "TEACHING",
    items: [
      {
        id: "printInstall",
        label: "Install page",
        title: "Diagram, assignment table and progression on one letter page",
      },
      {
        id: "positionReceivers",
        label: "Position view",
        submenu: "position",
        title: "One group at full weight, everyone else faded back",
      },
      {
        id: "printQuiz",
        label: "Quiz + answer key",
        title: "The diagram with assignments stripped, and a table to fill in",
      },
      {
        id: "printSlide",
        label: "Slide — 1920×1080",
        title: "Dark slide for the meeting-room projector",
      },
      { id: "printProgression", label: "Progression strip — 4 frames" },
      { id: "exportFrames", label: "Frame sequence — PNGs" },
    ],
  },
  {
    head: "FIELD",
    items: [
      {
        id: "printWristband",
        label: "Wristband — 8 cells",
        submenu: "wristband",
        title: "Eight thumbnails at wrist size, with cut lines",
      },
      {
        id: "printScout",
        label: "Scout card — 4-up",
        title: "Opponent looks drawn big, with room for the scout team’s note",
      },
      { id: "printCards", label: "Practice cards — 2-up" },
      {
        id: "printCallSheet",
        label: "Call sheet",
        title: "Grouped by tag, with a notes column",
      },
    ],
  },
  {
    head: "BOOK",
    items: [
      {
        id: "printPlaybook",
        label: "Full playbook",
        title: "Cover, contents and an install page per play",
      },
    ],
  },
];

export const positionGroups: readonly MenuEntry[] = [
  { id: "positionReceivers", label: "Receivers" },
  { id: "positionBacks", label: "Backs" },
  { id: "positionLine", label: "Line" },
  { id: "positionQb", label: "QB" },
  { id: "positionDefense", label: "Defense" },
];

export const saveItems: readonly MenuEntry[] = [
  {
    id: "savePlay",
    label: "Save",
    shortcut: "⌘S",
    title: "Update the play you have open",
  },
  {
    id: "saveAsVariant",
    label: "Save as variant",
    title: "Keep this as another version of the concept",
  },
  {
    id: "snapshot",
    label: "Snapshot",
    title: "Name this state and keep it in History only",
  },
];

/**
 * The original's palette also lists every Formation, Defense and saved Play.
 * Those catalogues do not exist in production yet, so the static commands are
 * carried here and the catalogue entries arrive with the browsers.
 */
export const paletteCommands: readonly MenuEntry[] = [
  { id: "toolSelect", label: "Select tool", shortcut: "V" },
  { id: "toolPlayer", label: "Player tool", shortcut: "P" },
  { id: "toolRoute", label: "Route tool", shortcut: "R" },
  { id: "toolMotion", label: "Motion tool", shortcut: "M" },
  { id: "toolBlock", label: "Block tool", shortcut: "B" },
  { id: "toolZone", label: "Zone drop tool", shortcut: "Z" },
  { id: "toolText", label: "Text tool", shortcut: "T" },
  { id: "focus", label: "Focus mode", shortcut: "F" },
  { id: "toggleInspector", label: "Inspector on / off", shortcut: "⌥1" },
  { id: "toggleRail", label: "Tools on / off", shortcut: "⌥2" },
  { id: "present", label: "Present the play" },
  { id: "print", label: "Print preview" },
  { id: "fitToSelection", label: "Fit to selection", shortcut: "⌘2" },
  { id: "toggleSnapping", label: "Toggle snapping", shortcut: "S" },
  { id: "fitField", label: "Fit field", shortcut: "⌘0" },
  { id: "zoomToSelection", label: "Zoom to selection" },
  { id: "centerBall", label: "Center on the ball" },
  { id: "ballLeft", label: "Ball on the left hash" },
  { id: "ballMiddle", label: "Ball in the middle of the field" },
  { id: "ballRight", label: "Ball on the right hash" },
  { id: "mirror", label: "Mirror" },
  { id: "flipStrength", label: "Flip strength" },
  { id: "alignDepth", label: "Same depth — selected players" },
  { id: "alignSplits", label: "Even splits — selected players" },
  ...conceptNames.map((name): MenuEntry => ({
    id: `concept:${name}`,
    label: `Concept — ${name}`,
  })),
  { id: "toggleZones", label: "Hide zone areas" },
  { id: "clearRoutesOffense", label: "Clear offensive routes" },
  { id: "clearRoutesDefense", label: "Clear defensive assignments" },
  { id: "clearAllLines", label: "Clear every line" },
  { id: "clearOffense", label: "Clear offense" },
  { id: "clearDefense", label: "Clear defense" },
  { id: "clearText", label: "Clear text" },
  { id: "clearField", label: "Clear the whole field" },
  { id: "savePlay", label: "Save play" },
  { id: "newVariation", label: "New variation" },
  { id: "group", label: "Group", shortcut: "⌘G" },
  { id: "ungroup", label: "Ungroup", shortcut: "⇧⌘G" },
  { id: "bringForward", label: "Bring forward", shortcut: "⌘]" },
  { id: "sendBackward", label: "Send backward", shortcut: "⌘[" },
  { id: "reverseRoute", label: "Reverse route" },
  { id: "addDepthLabel", label: "Add depth label to segment" },
  { id: "newPlay", label: "New play" },
  { id: "shortcuts", label: "Keyboard shortcuts", shortcut: "?" },
  ...exportGroups.flatMap((group) =>
    group.items
      .filter((item) => !item.submenu)
      .map((item): MenuEntry => ({
        id: item.id,
        label: `Export: ${item.label}`,
      })),
  ),
];

export const shortcutRows: readonly (readonly [string, string])[] = [
  ["Select", "V"],
  ["Player", "P"],
  ["Route", "R"],
  ["Motion", "M"],
  ["Block", "B"],
  ["Zone drop", "Z"],
  ["Text", "T"],
  ["Focus mode — both panels", "F"],
  ["Inspector on / off", "⌥1"],
  ["Tools on / off", "⌥2"],
  ["Fit to selection", "⌘2"],
  ["Leave present / print", "esc"],
  ["Formations", "⇧⌘F"],
  ["Defenses", "⇧⌘D"],
  ["Snapping on / off", "S"],
  ["Command palette", "⌘K"],
  ["This panel", "?"],
  ["Undo / redo", "⌘Z / ⇧⌘Z"],
  ["Save · variant · snapshot", "⌘S"],
  ["Duplicate", "⌘D"],
  ["Select all", "⌘A"],
  ["Fit field", "⌘0"],
  ["Zoom in / out", "⌘= / ⌘-"],
  ["Pan the field", "space-drag, alt-drag or two fingers"],
  ["Zoom to cursor", "scroll or pinch"],
  ["Pan sideways", "shift-scroll"],
  ["Menu on a player or route", "right-click or long-press"],
  ["Add to selection", "shift-click"],
  ["Marquee select", "drag empty field"],
  ["Add a node", "double-click a line"],
  ["Exact depth while drawing", "type a number"],
  ["Read order on a route", "1–9"],
  ["Copy / paste", "⌘C / ⌘V"],
  ["Group / ungroup", "⌘G / ⇧⌘G"],
  ["Forward / backward", "⌘] / ⌘["],
  ["Finish route", "Enter or double-click"],
  ["Cancel", "Esc"],
  ["Remove last point", "⌫ while drawing"],
  ["Delete selection", "⌫"],
];
