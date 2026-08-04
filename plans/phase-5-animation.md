# Phase 5 — Animation

Read `plans/README.md` first. Requires Phase 1 (`role`, so timing defaults can be
football-aware) and benefits from Phase 3's Present mode, which is where animation is
watched.

## The problem

A diagram shows where everyone goes; it does not show that the dig clears the space *before*
the shallow gets there. Timing is the coaching content a static diagram cannot carry.
Nothing in the editor moves today except the guided tour's scripted playback.

## What to build

### 1. Timing on the route, not on a separate timeline

Add to each route: `{ speed: 1.0, delay: 0, hold: 0 }` — a multiplier on the default pace,
a pre-snap delay in beats, and a hold at the end (a hitch sitting down). Defaults come
from `role` and route shape: linemen slower, backs delayed by their footwork, a hitch gets
`hold: 0.6` automatically.

Distance along the route drives position — precompute cumulative segment lengths so a
receiver moves at constant speed through a break instead of accelerating through long
segments. Curved segments sample the same Bézier the renderer uses; do not approximate
with straight chords.

### 2. Playback control

A 34px bar under the canvas, visible only when the play has at least one route:

```
▶  ├──────●───────────────┤  1.4s / 3.2s   [0.5× 1× 2×]   ⟲
```

- Space plays and pauses. `⟲` resets to the snap.
- The scrubber is draggable and the play is fully interactive at any frozen frame — this
  is a diagram that moves, not a video player.
- Ghost trails: each player leaves his path at 18% opacity behind him, so the still frame
  at any moment reads as a diagram.
- Defenders animate too when they have assignments — a zone drop moves to its bubble and
  sits.

### 3. Pre-snap motion

A route whose `kind` is `motion` runs **before** the snap: playback has a pre-snap phase
(motion only, ball static) then the snap (everything else). The bar shows the snap as a
1px #171717 tick on the scrubber. This is what makes motion diagrams finally legible.

### 4. Export

- **Animated GIF** is not worth the encoder weight. Instead: **frame sequence** — a numbered
  PNG per 0.2s, downloaded as individual files with a manifest, plus
- **Progression strip** — a single letter-landscape sheet with the play at 4 key frames
  (snap, first break, throw, catch) in a row, each captioned with its timestamp. This is
  more useful to a coach than a video and it prints.

Both reuse the existing PNG export path with a frozen frame index.

### 5. Timing inspector

In the Route inspector, one new section — three controls, no more:

```
Timing     Delay [ 0.0 ]   Speed [ 1.0× ]   Hold [ 0.6 ]
```

Mono numeric inputs, same 32px treatment as the depth field. A hint underneath: "Delay is
beats after the snap. Hold is how long he sits down at the end."

## Done when

- [ ] Space plays the whole play; every player arrives at his endpoint.
- [ ] A player moves at a constant pace through breaks and curves.
- [ ] Scrubbing to any frame leaves the play selectable and editable.
- [ ] Motion runs before the snap and the snap tick is visible on the scrubber.
- [ ] Ghost trails make any frozen frame readable as a diagram.
- [ ] The progression strip prints four frames with timestamps on one sheet.
- [ ] Timing values survive save, mirror, duplicate, and realignment.
