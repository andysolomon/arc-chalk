import { afterEach, describe, expect, it } from "vitest";

import { lockPageZoom } from "./page-zoom";

const touchMove = (fingers: number): Event => {
  const event = new Event("touchmove", { cancelable: true, bubbles: true });
  Object.defineProperty(event, "touches", {
    value: Array.from({ length: fingers }, () => ({})),
  });
  return event;
};

describe("lockPageZoom", () => {
  let release: (() => void) | undefined;
  afterEach(() => {
    release?.();
    release = undefined;
  });

  it("drops pinch from the page but keeps panning", () => {
    release = lockPageZoom();
    expect(document.documentElement.style.touchAction).toBe("pan-x pan-y");
  });

  it("refuses Safari's pinch gesture events", () => {
    release = lockPageZoom();
    for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
      const event = new Event(type, { cancelable: true, bubbles: true });
      document.body.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
  });

  it("refuses a two-finger touchmove but lets one finger scroll", () => {
    release = lockPageZoom();
    const pinch = touchMove(2);
    document.body.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(true);

    const scroll = touchMove(1);
    document.body.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(false);
  });

  it("lets go of the page when released", () => {
    lockPageZoom()();
    expect(document.documentElement.style.touchAction).toBe("");
    const event = new Event("gesturestart", {
      cancelable: true,
      bubbles: true,
    });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
