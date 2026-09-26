import { describe, expect, it } from "vitest";

import { routeDotGeometry, routeDotPressStartsRoute } from "./route-dot";

describe("the draw-a-route handle", () => {
  it("starts a route from the mark, and not from a man standing under the touch target", () => {
    const handle = { cy: -27, visualRadius: 7 };
    const players = [
      { id: "x", position: { x: 0, y: 0 } },
      { id: "h", position: { x: 30, y: 0 } },
    ];
    expect(routeDotPressStartsRoute(0, -27, handle, "x", players)).toBe(true);
    expect(routeDotPressStartsRoute(0, -40, handle, "x", players)).toBe(true);
    expect(routeDotPressStartsRoute(0, 0, handle, "x", players)).toBe(false);
    // A press on H's body belongs to H, even from X's handle.
    expect(routeDotPressStartsRoute(30, 0, handle, "x", players)).toBe(false);
    // A defender standing on the mark does not swallow a press on the mark.
    const withDefender = [...players, { id: "m", position: { x: 0, y: -27 } }];
    expect(routeDotPressStartsRoute(0, -27, handle, "x", withDefender)).toBe(
      true,
    );
  });

  it("leaves a finger that lands a little high on a man to move him", () => {
    // A phone draws the field at about half size.
    const zoom = 0.48;
    const handle = routeDotGeometry(zoom, false);
    const players = [{ id: "c", position: { x: 0, y: 0 } }];
    const starts = (x: number, y: number) =>
      routeDotPressStartsRoute(x, y, handle, "c", players, handle.fingerReach);
    // Anywhere the field would give the press to him, the handle leaves it.
    for (const above of [6, 12, 18, 22]) {
      expect(starts(0, -above / zoom)).toBe(false);
    }
    for (const aside of [-20, 20]) {
      expect(starts(aside / zoom, -8 / zoom)).toBe(false);
    }
    // Past his reach, the dot and the grass around it still draw.
    expect(starts(0, handle.cy)).toBe(true);
    expect(starts(0, -24 / zoom)).toBe(true);
    expect(starts(0, -45 / zoom)).toBe(true);
  });

  it("lets a finger reach the man the mark is drawn over on a phone", () => {
    // The quarterback picked on a phone: his mark sits over the center, who
    // lines up a dozen screen pixels ahead of him.
    const zoom = 0.39;
    const handle = routeDotGeometry(zoom, false);
    const players = [
      { id: "q", position: { x: 500, y: 478 } },
      { id: "ol2", position: { x: 500, y: 478 - 12 / zoom } },
      { id: "ol3", position: { x: 500 + 14 / zoom, y: 478 - 12 / zoom } },
    ];
    const starts = (x: number, y: number) =>
      routeDotPressStartsRoute(x, y, handle, "q", players, handle.fingerReach);
    // Under a mouse the mark comes first, as it always has.
    const mouse = routeDotGeometry(zoom, true);
    expect(routeDotPressStartsRoute(0, -12 / zoom, mouse, "q", players)).toBe(
      true,
    );
    // A finger on the center, or leaning off him toward the guard, is his.
    expect(starts(0, -12 / zoom)).toBe(false);
    expect(starts(4 / zoom, -12 / zoom)).toBe(false);
    // The far side of the mark, and the mark's own centre, still draw.
    expect(starts(0, handle.cy - 6 / zoom)).toBe(true);
    expect(starts(0, handle.cy)).toBe(true);
    // A finger on the quarterback picks him up rather than drawing.
    expect(starts(0, -2 / zoom)).toBe(false);
  });
});
