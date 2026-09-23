---
status: accepted
---

# Free-drawn lines, and Done over the field (amends ADR 0052)

ADR 0052 has a line by hand start from the selected man and take its breaks from the
field, one click each, finished on Enter or a double click; a phone has a Done button in
its tool row because it has neither. Every line was therefore straight segments, or bent
one segment at a time by holding a press. A Coach who wants a line the shape of his hand
— a wheel, a swing, a scramble drill — had to place it break by break, and on a desk had
to remember a key or a double click to end it.

Product decision (2026-09-23): a line by hand can also be traced, and every line in hand
has Done in reach of the pointer.

## Decision

**Free draw is a switch, not a tool.** The inspector's Draw row gains a _Free draw_
switch, the command palette reaches it as _Free draw on / off_, and it is remembered per
device with the rest of the chrome. On, every line by hand — the Draw buttons, the
R M B Z keys, the blue dot and the palette — is traced: a press on the field takes hold
of the pointer, the line follows it while it is held down, and it is finished the moment
it lifts, the way a pen leaves the whiteboard. A press that lifts where it landed is a
tap and leaves the line in hand. Off, each click is a break as before. The mode can
change mid-line; the breaks placed so far stay.

**The fit.** A traced stroke is thinned on screen (Ramer–Douglas–Peucker at 2.5 px, so a
tremor is a tremor at any zoom) and a quadratic curve is run through the gentle bends
while any turn of 40° or more stays a sharp break. The Play receives the fitted line —
a handful of breaks and controls, never the samples — so a free-drawn route is edited,
animated, exported and hashed like any other. While tracing, snap and typed depths do
not apply; Backspace takes the whole stroke back; Escape abandons it. The overlay draws
the stroke as solid ink under the pointer with no aim line ahead of it.

**Done over the field.** While a line is in hand on a desk or a tablet, a bar sits at
the top of the field — under the scope bar when one is up — naming the line, offering
_Breaks_ / _Free draw_, _Done_ and _Cancel_. Done is the same finish as Enter and a
double click; Cancel is Escape. A phone keeps Done in its tool row (ADR 0052) and does
not show the bar. The status bar names Done beside Enter, and says how a free-drawn line
ends.

## Consequences

- `FieldDrawingState` gains `mode` and its points may be marked `traced`; the finish
  resolves them through `resolveDrawnPoints`. `start-drawing` and `start-route` take an
  optional `mode`; `set-drawing-mode` switches the line in hand.
- The live paint holds a traced stroke's samples off the React tree; only a new break or
  a change of mode reaches the shell, as a new break did before.
- `ChromeState` gains an optional `freeDraw`; every existing chrome record reads as
  breaks, which is what every Coach has had until now.
- The parity exception recorded in ADR 0052 stands: free drawing still starts from a
  man and never from a rail tool.
