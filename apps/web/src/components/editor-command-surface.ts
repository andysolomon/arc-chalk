import {
  demoTours,
  stockDefensiveCalls,
  stockFormations,
  type DemoTourId,
} from "@chalk/domain";

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
  /** The other unit's shadow on or off the field (ADR 0053); H on the rail. */
  | "toggleShadow"
  | "settings"
  | "mirror"
  | "flipStrength"
  /** A Play is started as one unit or the other, never switched (ADR 0053). */
  | "newOffensivePlay"
  | "newDefensivePlay"
  /** The Playbooks workspace — Game Plans (issue #66). */
  | "gamePlans"
  /** The three destinations in the header: Editor, Playbooks, Game Day (issue #65). */
  | "editor"
  | "playbooks"
  | "gameDay"
  /** Demo and its tours live under Help (issue #65). */
  | "demo"
  | `demo:${DemoTourId}`
  | "palette"
  | "toolSelect"
  | "toolText"
  /** Lines by hand start from the selected man (ADR 0052). */
  | "drawRoute"
  | "drawMotion"
  | "drawBlock"
  | "drawZone"
  | "toggleInspector"
  | "toggleRail"
  | "present"
  | "print"
  /** The output workflow (issue #69) and the outputs run lately. */
  | "output"
  | `preset:${string}`
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
  // Reached from the context menu and the keyboard rather than the palette,
  // which is where the original leaves them too.
  | "duplicate"
  | "deleteSelection"
  | "reverseRoute"
  | "addDepthLabel"
  | "shortcuts"
  /** Opened from ⇧⌘F / ⇧⌘D, not from a palette row — the original's own split. */
  | "formations"
  | "defenses"
  | `formation:${string}`
  | `defense:${string}`
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
  | `concept:${string}`
  | `open:${string}`;

/** What the shell can actually run right now; anything absent is unavailable. */
export type ActionMap = Partial<Record<ActionId, () => void>>;

export interface MenuEntry {
  readonly id: ActionId;
  readonly label: string;
  readonly shortcut?: string;
  readonly title?: string;
}

/**
 * The two ways a Play begins. There is no plain "new play": a Coach draws an
 * offensive play or a defensive one, and the field, the inspector and the
 * pill are that unit's from the first man (ADR 0053).
 */
export const newPlayEntries: readonly MenuEntry[] = [
  {
    id: "newOffensivePlay",
    label: "New offensive play",
    title: "A blank field for an offensive play — the defense is its shadow",
  },
  {
    id: "newDefensivePlay",
    label: "New defensive play",
    title: "A blank field for a defensive play — the offense is its shadow",
  },
];

/**
 * The Clear menu on the tool rail. The palette reaches the same seven
 * erasures by their long names; these are the short ones a Coach reads with
 * the field still in front of him.
 */
export const clearEntries: readonly MenuEntry[] = [
  {
    id: "clearRoutesDefense",
    label: "Coverage",
    title:
      "Wipe the coverage drops, blitz paths and stunts — the defenders stay where they are",
  },
  {
    id: "clearRoutesOffense",
    label: "Routes",
    title:
      "Wipe the offensive routes, motions and blocks — the players stay where they are",
  },
  {
    id: "clearOffense",
    label: "Offense",
    title: "Remove the offensive players and their routes",
  },
  {
    id: "clearDefense",
    label: "Defense",
    title: "Remove the defenders, their zone drops and blitz paths",
  },
  {
    id: "clearText",
    label: "Text",
    title: "Remove every text label and coaching note",
  },
  {
    id: "clearField",
    label: "All",
    title: "Empty the field — players, routes and text",
  },
];

/** What the menu tells a Coach the six of them add up to. */
export const clearMenuHint =
  "Clears one layer and leaves the rest standing — Routes takes the concept " +
  "off, Coverage takes the call off, both keep their players, so you can " +
  "redraw the concept from the same formation. Undo brings any of it back.";

/**
 * The Help menu (issue #65): the guided tours the original keeps behind its
 * Demo tab, and the two references the inspector already carried. A Coach on
 * his first day finds the tools walked for him here rather than in a tab
 * beside the play he is trying to draw.
 */
export const helpEntries: readonly MenuEntry[] = [
  {
    id: "demo",
    label: "Demo — guided tour",
    title: "Watch the drawing tools used on a real play",
  },
  ...demoTours.map((tour): MenuEntry => ({
    id: `demo:${tour.id}`,
    label: tour.tab,
    title: `Tutorial — ${tour.playName}`,
  })),
  { id: "shortcuts", label: "Keyboard shortcuts", shortcut: "?" },
  { id: "palette", label: "Command palette", shortcut: "⌘K" },
];

/** Where the tutorials start and end inside {@link helpEntries}. */
export const helpTutorialRange = Object.freeze({
  start: 1,
  end: 1 + demoTours.length,
});

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

export interface PaletteCatalog {
  readonly defenses?: readonly { readonly id: string; readonly name: string }[];
  readonly formations?: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly savedPlays?: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly zonesHidden?: boolean;
}

/**
 * The original's palette lists every Formation, Defense and saved Play beside
 * its static commands, concatenated in that order after Keyboard shortcuts
 * and the Export entries. The catalogues arrive with the browsers that own
 * them, so this is a function of what the Coach has — a set he saved, a Play
 * he named — rather than a module constant that can only see what Chalk ships.
 * Opening the Formations or Defenses browser is ⇧⌘F / ⇧⌘D, not a palette row.
 */
export function paletteCommands(
  catalog: PaletteCatalog = {},
): readonly MenuEntry[] {
  const formations = catalog.formations ?? stockFormations;
  const defenses =
    catalog.defenses ??
    stockDefensiveCalls.map((call) => ({
      id: call.formation.id,
      name: call.formation.name,
    }));
  return [
    { id: "toolSelect", label: "Select tool", shortcut: "V" },
    { id: "toolText", label: "Text tool", shortcut: "T" },
    {
      id: "drawRoute",
      label: "Draw his route",
      shortcut: "R",
      title: "With one man selected: a route by hand from his stance",
    },
    {
      id: "drawMotion",
      label: "Draw his motion",
      shortcut: "M",
      title: "With one man selected: a motion path by hand from his stance",
    },
    {
      id: "drawBlock",
      label: "Draw his block or blitz",
      shortcut: "B",
      title:
        "With one man selected: a block by hand, or a blitz path from a defender",
    },
    {
      id: "drawZone",
      label: "Draw his zone drop",
      shortcut: "Z",
      title: "With one defender selected: a zone drop by hand from his stance",
    },
    { id: "focus", label: "Focus mode", shortcut: "F" },
    { id: "settings", label: "Settings" },
    { id: "toggleInspector", label: "Inspector on / off", shortcut: "⌥1" },
    { id: "toggleRail", label: "Tools on / off", shortcut: "⌥2" },
    { id: "present", label: "Present the play" },
    { id: "print", label: "Print preview" },
    { id: "fitToSelection", label: "Fit to selection", shortcut: "⌘2" },
    { id: "toggleSnapping", label: "Toggle snapping", shortcut: "S" },
    {
      id: "toggleShadow",
      label: "Shadow on / off",
      shortcut: "H",
      title:
        "Show or hide the other unit under the play — it stays in the play",
    },
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
    {
      id: "toggleZones",
      label: catalog.zonesHidden ? "Show zone areas" : "Hide zone areas",
    },
    { id: "clearRoutesOffense", label: "Clear offensive routes" },
    { id: "clearRoutesDefense", label: "Clear defensive assignments" },
    { id: "clearAllLines", label: "Clear every line" },
    { id: "clearOffense", label: "Clear offense" },
    { id: "clearDefense", label: "Clear defense" },
    { id: "clearText", label: "Clear text" },
    { id: "clearField", label: "Clear the whole field" },
    { id: "savePlay", label: "Save play" },
    { id: "newVariation", label: "New variation" },
    { id: "gamePlans", label: "Game plans" },
    { id: "playbooks", label: "Playbooks" },
    { id: "gameDay", label: "Game Day" },
    { id: "demo", label: "Demo — guided tour" },
    { id: "group", label: "Group", shortcut: "⌘G" },
    { id: "ungroup", label: "Ungroup", shortcut: "⇧⌘G" },
    { id: "bringForward", label: "Bring forward", shortcut: "⌘]" },
    { id: "sendBackward", label: "Send backward", shortcut: "⌘[" },
    { id: "reverseRoute", label: "Reverse route" },
    { id: "addDepthLabel", label: "Add depth label to segment" },
    { id: "newOffensivePlay", label: "New offensive play" },
    { id: "newDefensivePlay", label: "New defensive play" },
    { id: "shortcuts", label: "Keyboard shortcuts", shortcut: "?" },
    ...exportGroups.flatMap((group) =>
      group.items
        .filter((item) => !item.submenu)
        .map((item): MenuEntry => ({
          id: item.id,
          label: `Export: ${item.label}`,
        })),
    ),
    ...formations.map((formation): MenuEntry => ({
      id: `formation:${formation.id}`,
      label: `Formation: ${formation.name}`,
    })),
    ...defenses.map((call): MenuEntry => ({
      id: `defense:${call.id}`,
      label: `Defense: ${call.name}`,
    })),
    ...(catalog.savedPlays ?? []).slice(0, 12).map((play): MenuEntry => ({
      id: `open:${play.id}`,
      label: `Open: ${play.name}`,
    })),
  ];
}

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
  ["Play / pause", "space"],
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
  ["Shadow on / off", "H"],
];
