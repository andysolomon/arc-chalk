import { describe, expect, it } from "vitest";

import {
  routeDotBodyRadius,
  routeDotGeometry,
  routeDotPressStartsRoute,
} from "./route-dot";

describe("the draw-a-route handle", () => {
  it("stays a 44px touch target, sitting outside the man's own reach on a phone", () => {
    const phone = routeDotGeometry(0.35, false);
    expect(phone.hitRadius * 0.35).toBeCloseTo(22);
    expect(phone.visualRadius * 0.35).toBeCloseTo(7);
    // The visible dot starts where a finger stops reaching the man.
    expect(-(phone.cy + phone.visualRadius)).toBeCloseTo(
      routeDotBodyRadius(0.35, "touch"),
    );

    // With a mouse it stays where the original put it.
    const mouse = routeDotGeometry(1, true);
    expect(mouse.hitRadius).toBe(14);
    expect(mouse.visualRadius).toBe(7);
    expect(mouse.cy).toBe(-27);
  });

  it("starts a route from the mark, and not from a man standing under the touch target", () => {
    const handle = { cy: -27, visualRadius: 7, bodyRadius: 17 };
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
    const handle = {
      ...routeDotGeometry(zoom, false),
      bodyRadius: routeDotBodyRadius(zoom, "touch"),
    };
    const players = [{ id: "c", position: { x: 0, y: 0 } }];
    // Anywhere the field would give the press to him, the handle leaves it.
    for (const above of [6, 12, 18, 22]) {
      expect(
        routeDotPressStartsRoute(0, -above / zoom, handle, "c", players),
      ).toBe(false);
    }
    for (const aside of [-20, 20]) {
      expect(
        routeDotPressStartsRoute(aside / zoom, -8 / zoom, handle, "c", players),
      ).toBe(false);
    }
    // Past his reach, the dot and the grass around it still draw.
    expect(routeDotPressStartsRoute(0, handle.cy, handle, "c", players)).toBe(
      true,
    );
    expect(routeDotPressStartsRoute(0, -24 / zoom, handle, "c", players)).toBe(
      true,
    );
    expect(routeDotPressStartsRoute(0, -45 / zoom, handle, "c", players)).toBe(
      true,
    );
  });
});
