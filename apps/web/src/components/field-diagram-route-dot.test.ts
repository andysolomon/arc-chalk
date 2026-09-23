import { describe, expect, it } from "vitest";

import { routeDotGeometry, routeDotPressStartsRoute } from "./route-dot";

describe("the draw-a-route handle", () => {
  it("stays a 44px touch target and clear of the symbol on a phone", () => {
    const phone = routeDotGeometry(0.35, false);
    expect(phone.hitRadius * 0.35).toBeCloseTo(22);
    expect(phone.visualRadius * 0.35).toBeCloseTo(7);
    // The visible dot ends above the symbol, which reaches about 13px.
    expect(phone.cy + phone.visualRadius).toBeCloseTo(-20);

    const mouse = routeDotGeometry(1, true);
    expect(mouse.hitRadius).toBe(14);
    expect(mouse.visualRadius).toBe(7);
  });

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
});
