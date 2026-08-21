import { demoStepOf, type DemoStep, type DemoTour } from "./demo";
import { migrateLegacyPlay, type LegacyPlay } from "./legacy";
import { stickThunderPlay } from "./seed-stick-thunder";

type CanvasPoint =
  | readonly [number, number]
  | readonly [
      number,
      number,
      { readonly cx?: number; readonly cy?: number; readonly tick?: boolean },
    ];

const player = (
  id: string,
  x: number,
  y: number,
  label = "",
  extra: Record<string, unknown> = {},
) => ({
  id,
  x,
  y,
  symbol: "circle",
  label,
  sub: "",
  fill: "none",
  color: "k",
  ...extra,
});

const route = (
  id: string,
  playerId: string,
  points: readonly CanvasPoint[],
  extra: Record<string, unknown> = {},
) => ({
  id,
  kind: "route",
  playerId,
  branches: [],
  points: points.map(([x, y, rest]) => ({ x, y, ...rest })),
  lineStyle: "solid",
  endMarker: "arrow",
  color: "k",
  ...extra,
});

const label = (
  id: string,
  x: number,
  y: number,
  text: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  x,
  y,
  text,
  color: "k",
  size: 11,
  box: "none",
  boxColor: "y",
  ...extra,
});

const offensiveLine = (color = "k") =>
  [428, 464, 500, 536, 572].map((x, index) =>
    player(`ol${index}`, x, 448, "", {
      symbol: x === 500 ? "square" : "circle",
      color,
    }),
  );

const step = (
  title: string,
  tool: DemoStep["tool"],
  keys: string,
  durationMs: number,
  itemIds: readonly string[],
  clicks: readonly (readonly [number, number])[],
  panel: string,
  rows: readonly (readonly [string, string])[],
  caption: string,
): DemoStep => ({
  title,
  tool,
  keys,
  durationMs,
  itemIds,
  clicks,
  panel,
  rows,
  caption,
});

function tourFrom(
  id: DemoTour["id"],
  tab: string,
  playName: string,
  category: string,
  play: DemoTour["play"],
  steps: readonly DemoStep[],
): DemoTour {
  return {
    id,
    tab,
    playName,
    category,
    play,
    steps,
    stepOf: demoStepOf(steps),
  };
}

function playFrom(
  id: string,
  name: string,
  cat: LegacyPlay["cat"],
  doc: LegacyPlay["doc"],
) {
  return migrateLegacyPlay({ id, name, cat, doc });
}

const toolsSteps: readonly DemoStep[] = [
  step(
    "Player tool",
    "player",
    "P · click",
    1500,
    stickThunderPlay.players.map(({ id }) => id),
    [
      [316, 452],
      [281, 486],
      [492, 560],
      [632, 452],
      [886, 452],
    ],
    "Player",
    [
      ["symbol", "Symbol — circle, square, triangle, X"],
      ["fill", "Fill — none, half, solid, in any color"],
      ["text", "Letter and the tag under it"],
    ],
    "Press P and click the field to drop players. The inspector on the right sets the symbol, its fill, the letter inside, and the small tag underneath.",
  ),
  step(
    "Route tool",
    "route",
    "R · click · Enter",
    1700,
    ["rx", "l1", "l2"],
    [
      [316, 452],
      [308, 416],
      [126, 372],
    ],
    "Route",
    [
      ["line", "Line — solid, dashed, dotted"],
      ["end", "Ending — arrow, bar, dot, none"],
      ["color", "Color for the whole line"],
    ],
    "Press R, click the player, then click each break. Enter finishes the line and hands it to the inspector — solid with an arrow is a standard route.",
  ),
  step(
    "Breaks & curves",
    "select",
    "V · drag",
    1600,
    ["rf", "l3", "l4"],
    [
      [281, 486],
      [300, 344],
      [238, 330],
    ],
    "Route",
    [
      ["pt", "Round handle — move a break"],
      ["ctrl", "Square handle — bend the segment"],
      ["seg", "Click the line again to pick one segment"],
    ],
    "Select a line and its handles appear: round ones move breaks, square ones bend the stretch into an arc. Hold S to snap cuts to 45°.",
  ),
  step(
    "Endings",
    "select",
    "V",
    1500,
    ["ry", "l5", "l6"],
    [
      [632, 452],
      [524, 318],
    ],
    "Route",
    [
      ["end", "Dot — settle in the window"],
      ["arrow", "Arrow — run through it"],
      ["bar", "Bar — block / stalemate"],
    ],
    "The ending carries the coaching. Arrow means run through, a dot means throttle down and sit, a bar is a block.",
  ),
  step(
    "Blocks & ticks",
    "block",
    "B · segment",
    1700,
    ["rh", "l7", "l8", "l9"],
    [
      [492, 560],
      [600, 514],
      [714, 406],
    ],
    "Route",
    [
      ["tick", "Add block tick at this break"],
      ["bar", "Bar ending for a straight block"],
      ["dash", "Dashed line for a pull path"],
    ],
    "Press B for a blocking line — bar ending by default. For block-and-release, pick the first segment and add a tick: H chips, then leaks to the OUTLET.",
  ),
  step(
    "Alternate routes",
    "select",
    "V · sidebar",
    1500,
    ["rz", "l10"],
    [
      [886, 452],
      [886, 296],
    ],
    "Player · Routes & alternates",
    [
      ["r1", "Base stem — solid, the primary call"],
      ["add", "+ Alternate route"],
      ["r2", "Alternate 1 — dotted, off the same stance"],
    ],
    "An alternate starts over at his stance — a second full line for a different call, dotted so the base stem still reads first.",
  ),
  step(
    "Choice route",
    "select",
    "V · branch",
    1600,
    ["rz.b0", "l11"],
    [
      [886, 296],
      [912, 120],
    ],
    "Route · Choice",
    [
      ["branch", "Add choice branch at a break"],
      ["style", "Style the branch on its own"],
      ["pick", "Editing: Main / Branch 1"],
    ],
    "A choice route forks one line at a break. Z sits at 6 yards versus soft coverage, or turns it into a fade versus press — the YES / NO call, one player, one decision.",
  ),
  step(
    "Color & fills",
    "select",
    "V · color",
    1500,
    ["l12"],
    [[886, 516]],
    "Text · Box",
    [
      ["fill", "Yellow fill — coaching note"],
      ["outline", "Red outline — a decision"],
      ["col", "Six line colors for units and answers"],
    ],
    "Any line, letter, or label takes color; players take fills; labels take a boxed fill or outline. Yellow filled notes are reminders, red outlines are decisions.",
  ),
  step(
    "Build your own",
    "select",
    "V",
    900,
    [],
    [],
    "Library",
    [
      ["save", "Save keeps the play in the Library"],
      ["png", "Export writes a PNG"],
      ["mirror", "Mirror flips the call to the other side"],
    ],
    "That is the whole toolset — players, routes, breaks, endings, blocks, options, choices, color. Open it in the editor and remix this play.",
  ),
];

const quickPlay = playFrom("demo-quick", "Quick Routes — Four Verts", "Pass", {
  players: offensiveLine().concat([
    player("q", 500, 504, "Q"),
    player("f", 556, 504, "F"),
    player("x", 130, 452, "X"),
    player("h", 262, 452, "H"),
    player("y", 738, 452, "Y"),
    player("z", 870, 452, "Z"),
  ]),
  routes: [
    route("rx", "x", [
      [130, 452],
      [130, 284],
    ]),
    route("rh", "h", [
      [262, 452],
      [262, 414],
      [372, 318],
    ]),
    route("ry", "y", [
      [738, 452],
      [738, 316],
      [712, 342],
    ]),
    route("rz", "z", [
      [870, 452],
      [870, 316],
      [782, 232],
    ]),
    route("rf", "f", [
      [556, 504],
      [556, 492],
      [660, 464],
    ]),
  ],
  labels: [],
});

const quickSteps: readonly DemoStep[] = [
  step(
    "Start from a formation",
    "select",
    "sidebar",
    1200,
    quickPlay.players.map(({ id }) => id),
    [],
    "Formations",
    [
      ["a", "Gun Doubles — 2×2"],
      ["b", "Trips, Bunch, Empty, I-Form"],
      ["c", "⌘Z brings the old play back"],
    ],
    "A formation drops all eleven in one click. Everything after this is two clicks per receiver — no drawing.",
  ),
  step(
    "Go",
    "select",
    "V · click",
    1200,
    ["rx"],
    [[130, 452]],
    "Player · Quick routes",
    [
      ["a", "Select the player first"],
      ["b", "Go — straight up the field"],
      ["c", "Presets know which side he is on"],
    ],
    "Click X, then press Go. The preset draws from his exact spot and flips itself for the other side of the ball.",
  ),
  step(
    "Slant",
    "select",
    "V · click",
    1200,
    ["rh"],
    [[262, 452]],
    "Player · Quick routes",
    [
      ["a", "Slant — three steps, then in"],
      ["b", "Drag the break to change depth"],
      ["c", "S keeps every cut at 45°"],
    ],
    "H gets the Slant. A preset is a starting point — drag the round handle to set the depth you actually coach.",
  ),
  step(
    "Curl and Post",
    "select",
    "V · click",
    1500,
    ["ry", "rz"],
    [
      [738, 452],
      [870, 452],
    ],
    "Player · Quick routes",
    [
      ["a", "Curl — hitch back to the ball"],
      ["b", "Post — break to the middle"],
      ["c", "Corner, Dig, Out, Wheel, Hitch, Flat"],
    ],
    "Y curls, Z takes the Post. Ten presets cover the route tree; anything unusual you still draw with R.",
  ),
  step(
    "Outlet",
    "select",
    "V · click",
    1200,
    ["rf"],
    [[556, 504]],
    "Player · Quick routes",
    [
      ["a", "Flat — the checkdown"],
      ["b", "Save keeps it in the Library"],
      ["c", "Export writes a PNG for the script"],
    ],
    "Flat for the back and the concept is finished — five routes, ten clicks, nothing drawn by hand.",
  ),
];

const blockPlay = playFrom("demo-block", "Outside Zone — Pull", "Run", {
  players: offensiveLine().concat([
    player("q", 500, 504, "Q"),
    player("f", 556, 504, "F"),
    player("x", 130, 452, "X"),
    player("y", 700, 450, "Y"),
    player("z", 870, 452, "Z"),
    player("dt", 452, 404, "T", { symbol: "none" }),
    player("dn", 548, 404, "N", { symbol: "none" }),
    player("de", 628, 400, "E", { symbol: "none" }),
    player("dw", 430, 346, "W", { symbol: "none" }),
    player("dm", 528, 342, "M", { symbol: "none" }),
  ]),
  routes: [
    route(
      "b0",
      "ol0",
      [
        [428, 448],
        [416, 404],
      ],
      { kind: "block", endMarker: "bar" },
    ),
    route(
      "b1",
      "ol1",
      [
        [464, 448],
        [470, 404],
      ],
      { kind: "block", endMarker: "bar" },
    ),
    route(
      "b2",
      "ol2",
      [
        [500, 448],
        [534, 436],
        [558, 402],
      ],
      { kind: "block", endMarker: "bar" },
    ),
    route(
      "b3",
      "ol3",
      [
        [536, 448],
        [576, 438],
        [604, 404],
      ],
      { kind: "block", endMarker: "bar" },
    ),
    route(
      "b4",
      "ol4",
      [
        [572, 448],
        [600, 476, { cx: 590, cy: 472 }],
        [668, 452],
        [696, 406],
      ],
      { kind: "block", lineStyle: "dashed", endMarker: "bar" },
    ),
    route(
      "by",
      "y",
      [
        [700, 450],
        [668, 418, { tick: true }],
        [622, 388],
      ],
      { kind: "block", endMarker: "bar" },
    ),
    route(
      "rf",
      "f",
      [
        [556, 504],
        [614, 482],
        [672, 422],
        [684, 300],
      ],
      { color: "r" },
    ),
  ],
  labels: [
    label("lpull", 608, 498, "PULL", { box: "fill", boxColor: "y", size: 10 }),
    label("lball", 684, 286, "BALL", { color: "r", size: 10 }),
  ],
});

const blockSteps: readonly DemoStep[] = [
  step(
    "Front and defenders",
    "player",
    "P · click",
    1500,
    blockPlay.players.map(({ id }) => id),
    [
      [452, 404],
      [548, 404],
      [528, 342],
    ],
    "Player",
    [
      ["a", "Letter-only symbol for defenders"],
      ["b", "T N E up front, W M at linebacker"],
      ["c", "Color them separately if you like"],
    ],
    "Draw the defenders you are blocking first — the Letter symbol gives you a bare T, N, E, W, M with no circle around it.",
  ),
  step(
    "Base blocks",
    "block",
    "B · click · Enter",
    1700,
    ["b0", "b1", "b2", "b3"],
    [
      [428, 448],
      [416, 404],
      [500, 448],
      [558, 402],
    ],
    "Route · Block",
    [
      ["a", "Bar ending — engage and hold"],
      ["b", "Two points is enough for a base block"],
      ["c", "Angle the line at the man you take"],
    ],
    "Press B and click lineman to defender. The bar ending is the blocking mark — short, angled, one per assignment.",
  ),
  step(
    "Pull path",
    "block",
    "B · dashed",
    1800,
    ["b4", "lpull"],
    [
      [572, 448],
      [668, 452],
      [696, 406],
    ],
    "Route · Block",
    [
      ["a", "Dashed line — he moves before contact"],
      ["b", "Square handle bends the pull flat"],
      ["c", "Yellow note labels the technique"],
    ],
    "The right tackle pulls: same block line, set to dashed, bent around the heels. A yellow boxed note names it PULL.",
  ),
  step(
    "Down block and release",
    "select",
    "V · segment",
    1500,
    ["by"],
    [
      [700, 450],
      [668, 418],
      [622, 388],
    ],
    "Route · Segment",
    [
      ["a", "Pick segment 1 on the line"],
      ["b", "Add block tick at this break"],
      ["c", "Then the line continues to the LB"],
    ],
    "Y blocks down, then climbs. Select the line, pick the first segment, add a tick: that tick is the contact before he releases.",
  ),
  step(
    "Ball carrier",
    "select",
    "V · color",
    1500,
    ["rf", "lball"],
    [
      [556, 504],
      [672, 422],
      [684, 300],
    ],
    "Route · Color",
    [
      ["a", "Red for the ball"],
      ["b", "Curved handles for the read path"],
      ["c", "Six colors across lines and labels"],
    ],
    "The runner gets his own color so the blocking stays black. Bend his path with the square handles to show the read.",
  ),
];

const airPlay = playFrom("demo-air", "7-on-7 — Mesh", "Pass", {
  players: [
    player("q", 500, 470, "Q"),
    player("x", 120, 438, "X"),
    player("h", 250, 438, "H"),
    player("f", 380, 470, "F"),
    player("y", 700, 438, "Y"),
    player("z", 860, 438, "Z"),
  ],
  routes: [
    route("rh", "h", [
      [250, 438],
      [302, 392],
      [566, 384],
    ]),
    route("ry", "y", [
      [700, 438],
      [648, 398],
      [382, 390],
    ]),
    route("rx", "x", [
      [120, 438],
      [120, 330],
      [298, 330],
    ]),
    route("rz", "z", [
      [860, 438],
      [860, 304],
      [928, 222],
    ]),
    route("rf", "f", [
      [380, 470],
      [318, 492, { cx: 352, cy: 496 }],
      [214, 468],
    ]),
  ],
  labels: [
    label("lmesh", 462, 360, "MESH", { box: "fill", boxColor: "y", size: 10 }),
    label("ldig", 330, 324, "12 Yds"),
  ],
});

const airSteps: readonly DemoStep[] = [
  step(
    "No line needed",
    "player",
    "New · P",
    1400,
    airPlay.players.map(({ id }) => id),
    [
      [500, 470],
      [250, 438],
      [700, 438],
    ],
    "Player",
    [
      ["a", "New clears the whole field"],
      ["b", "Place only who you are coaching"],
      ["c", "Six players is a full 7-on-7 card"],
    ],
    "Press New for an empty field, then place just the players in the drill. Nothing forces a five-man line.",
  ),
  step(
    "Mesh",
    "route",
    "R · click · Enter",
    1700,
    ["rh", "ry", "lmesh"],
    [
      [250, 438],
      [302, 392],
      [566, 384],
    ],
    "Route",
    [
      ["a", "Two crossers at the same depth"],
      ["b", "S snaps the release to 45°"],
      ["c", "A yellow note names the concept"],
    ],
    "H and Y cross underneath. Draw one, then the other — the shared depth is what makes the rub work.",
  ),
  step(
    "Dig behind it",
    "route",
    "R · Enter",
    1500,
    ["rx", "ldig"],
    [
      [120, 438],
      [120, 330],
      [298, 330],
    ],
    "Route",
    [
      ["a", "Break at the depth you want"],
      ["b", "Text tool for the yardage"],
      ["c", "Labels drag anywhere afterwards"],
    ],
    "X runs the Dig on top of the mesh. Drop a text label at the break so the depth is explicit on the card.",
  ),
  step(
    "Corner and swing",
    "select",
    "V · drag",
    1500,
    ["rz", "rf"],
    [
      [860, 438],
      [860, 304],
      [928, 222],
    ],
    "Route",
    [
      ["a", "Square handle arcs the swing"],
      ["b", "Arrow for through, dot for settle"],
      ["c", "Save it as a drill in the Library"],
    ],
    "Z clears with the Corner and F swings out as the outlet — the arc comes from dragging the square handle.",
  ),
];

const gray = { color: "g" };
const bare = { symbol: "none" };
const offense = offensiveLine("g").concat([
  player("oq", 500, 504, "Q", gray),
  player("ox", 130, 452, "X", gray),
  player("oh", 262, 452, "H", gray),
  player("oy", 738, 452, "Y", gray),
  player("oz", 870, 452, "Z", gray),
]);
const front = [
  player("de1", 392, 404, "E", bare),
  player("dt1", 452, 404, "T", bare),
  player("dt2", 548, 404, "T", bare),
  player("de2", 608, 404, "E", bare),
  player("dw", 420, 344, "W", bare),
  player("dm", 504, 338, "M", bare),
  player("ds", 592, 344, "S", bare),
];
const back = [
  player("dc1", 140, 372, "C", bare),
  player("dc2", 860, 372, "C", bare),
  player("dfs", 500, 192, "F", bare),
  player("dss", 700, 304, "$", bare),
];
const zone = (id: string, playerId: string, points: readonly CanvasPoint[]) =>
  route(id, playerId, points, {
    kind: "zone",
    lineStyle: "dashed",
    endMarker: "bubble",
    color: "b",
  });

const defensePlay = playFrom("demo-defense", "Cover 3 — Fire Zone", "Defense", {
  players: offense.concat(front, back),
  routes: [
    zone("zc1", "dc1", [
      [140, 372],
      [152, 240],
    ]),
    zone("zc2", "dc2", [
      [860, 372],
      [848, 240],
    ]),
    zone("zfs", "dfs", [
      [500, 192],
      [500, 158],
    ]),
    zone("zw", "dw", [
      [420, 344],
      [356, 300],
    ]),
    zone("zm", "dm", [
      [504, 338],
      [548, 296],
    ]),
    zone("zss", "dss", [
      [700, 304],
      [760, 262],
    ]),
    route(
      "zb",
      "ds",
      [
        [592, 344],
        [578, 404],
        [560, 438],
      ],
      { kind: "blitz", color: "r" },
    ),
  ],
  labels: [
    label("lc3", 150, 196, "COVER 3", {
      box: "fill",
      boxColor: "y",
      size: 11,
      side: "def",
    }),
    label("lfire", 636, 472, "FIRE", {
      color: "r",
      size: 10,
      box: "outline",
      boxColor: "r",
      side: "def",
    }),
  ],
});

const defenseSteps: readonly DemoStep[] = [
  step(
    "Offense in gray",
    "select",
    "V · color",
    1400,
    offense.map(({ id }) => id),
    [],
    "Player · Color",
    [
      ["a", "Load or sketch the offense"],
      ["b", "Select all, then pick gray"],
      ["c", "Now the defense reads on top"],
    ],
    "Start from the look you are defending and drop it to gray — ⌘A selects everything, one swatch recolors it.",
  ),
  step(
    "Front seven",
    "player",
    "P · Letter",
    1600,
    front.map(({ id }) => id),
    [
      [392, 404],
      [500, 404],
      [504, 338],
    ],
    "Player · Symbol",
    [
      ["a", "Letter — bare initial, no shape"],
      ["b", "E T T E on the line"],
      ["c", "W M S at linebacker depth"],
    ],
    "Defenders are letters, not circles. Pick the Letter symbol and type the position — E T T E up front, W M S behind them.",
  ),
  step(
    "Secondary",
    "player",
    "P",
    1500,
    back.map(({ id }) => id),
    [
      [140, 372],
      [860, 372],
      [500, 192],
    ],
    "Player",
    [
      ["a", "C corners, F free safety"],
      ["b", "$ for the strong safety"],
      ["c", "Any character works as a label"],
    ],
    "Corners outside, free safety on top, strong safety rolled down — the symbol set covers any secondary shorthand.",
  ),
  step(
    "Zone tool",
    "zone",
    "Z · click",
    1800,
    ["zc1", "zc2", "zfs", "zw", "zm", "zss", "lc3"],
    [
      [140, 372],
      [152, 240],
      [504, 338],
      [548, 296],
    ],
    "Route · Zone",
    [
      ["a", "Dashed drop, open bubble ending"],
      ["b", "Bubble means area, not a man"],
      ["c", "Blue keeps coverage off the front"],
    ],
    "Press Z and drop each defender into his area. The open bubble ending is the tell: he owns space, not a receiver.",
  ),
  step(
    "Blitz",
    "select",
    "V · kind",
    1500,
    ["zb", "lfire"],
    [
      [592, 344],
      [578, 404],
      [560, 438],
    ],
    "Route · Kind",
    [
      ["a", "Blitz — solid red arrow"],
      ["b", "Aim it through the gap he takes"],
      ["c", "Boxed red label names the call"],
    ],
    "Switch a line to Blitz and it goes solid red, pointed through the gap. Fire zone: S comes, the rest of the shell stays.",
  ),
];

export const demoTours: readonly DemoTour[] = [
  tourFrom(
    "tools",
    "Tool tour",
    "Stick — Thunder",
    "Pass",
    stickThunderPlay,
    toolsSteps,
  ),
  tourFrom(
    "quick",
    "Quick routes",
    "Quick Routes — Four Verts",
    "Pass",
    quickPlay,
    quickSteps,
  ),
  tourFrom(
    "block",
    "Blocking",
    "Outside Zone — Pull",
    "Run",
    blockPlay,
    blockSteps,
  ),
  tourFrom(
    "air",
    "7-on-7 · no line",
    "7-on-7 — Mesh",
    "Pass",
    airPlay,
    airSteps,
  ),
  tourFrom(
    "defense",
    "Defense",
    "Cover 3 — Fire Zone",
    "Defense",
    defensePlay,
    defenseSteps,
  ),
];

export function demoTour(id: DemoTour["id"]): DemoTour {
  const tour = demoTours.find((candidate) => candidate.id === id);
  if (!tour) throw new Error(`No such demo: ${id}`);
  return tour;
}
