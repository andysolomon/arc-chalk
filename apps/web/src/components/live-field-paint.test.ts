import { summarizePaintSamples } from "@chalk/editor";
import { describe, expect, it } from "vitest";

import { applyLiveFieldPaint, clearLiveFieldPaint } from "./live-field-paint";

function svgWithPlayer(id: string, x: number, y: number): SVGSVGElement {
  document.body.innerHTML = `
    <svg class="field-diagram" viewBox="0 0 1000 620" data-base-viewbox="0 0 1000 620">
      <g data-scene-player="${id}" data-base-x="${x}" data-base-y="${y}" transform="translate(${x} ${y})"></g>
      <g data-scene-path-group="rx">
        <path data-scene-path="rx" d="M 0 0 L 10 10"></path>
      </g>
      <g data-scene-player="q" data-base-x="500" data-base-y="478" transform="translate(500 478)"></g>
    </svg>
  `;
  return document.querySelector("svg.field-diagram") as SVGSVGElement;
}

describe("applyLiveFieldPaint", () => {
  it("translates only the affected Player and his route", () => {
    const svg = svgWithPlayer("x", 316, 452);
    applyLiveFieldPaint(svg, {
      move: {
        dx: 20,
        dy: -12,
        playerIds: ["x"],
        pathIds: ["rx"],
        labelIds: [],
      },
    });

    expect(svg.querySelector('[data-scene-player="x"]')).toHaveAttribute(
      "transform",
      "translate(336 440)",
    );
    expect(svg.querySelector('[data-scene-path-group="rx"]')).toHaveAttribute(
      "transform",
      "translate(20 -12)",
    );
    expect(svg.querySelector('[data-scene-player="q"]')).toHaveAttribute(
      "transform",
      "translate(500 478)",
    );
    expect(svg).toHaveAttribute("data-live-paint", "move");
  });

  it("patches a handle stroke without moving other men", () => {
    const svg = svgWithPlayer("x", 316, 452);
    applyLiveFieldPaint(svg, {
      pathStrokes: [
        {
          id: "rx",
          d: "M 1 1 L 2 2",
          style: { line: "solid", ending: "arrow", color: "ink" },
        },
      ],
    });

    expect(svg.querySelector('[data-scene-path="rx"]')).toHaveAttribute(
      "d",
      "M 1 1 L 2 2",
    );
    expect(svg.querySelector('[data-scene-player="x"]')).toHaveAttribute(
      "transform",
      "translate(316 452)",
    );
  });

  it("writes budget metrics the e2e harness reads, and clear restores the base", () => {
    const svg = svgWithPlayer("x", 316, 452);
    applyLiveFieldPaint(svg, {
      move: {
        dx: 8,
        dy: 0,
        playerIds: ["x"],
        pathIds: [],
        labelIds: [],
      },
      camera: { x: 10, y: 20, width: 800, height: 496 },
      metrics: summarizePaintSamples(
        [16, 16, 16, 16, 16, 16, 16, 16, 16, 16],
        [8, 9, 10, 11, 12, 8, 9, 10, 11, 12],
      ),
    });

    expect(svg.getAttribute("viewBox")).toBe("10 20 800 496");
    expect(svg).toHaveAttribute("data-frame-within-budget", "true");
    expect(svg).toHaveAttribute("data-input-to-paint-within-budget", "true");
    expect(Number(svg.getAttribute("data-fps"))).toBeGreaterThan(60);

    clearLiveFieldPaint(svg);
    expect(svg.querySelector('[data-scene-player="x"]')).toHaveAttribute(
      "transform",
      "translate(316 452)",
    );
    expect(svg.getAttribute("viewBox")).toBe("0 0 1000 620");
    expect(svg.getAttribute("data-live-paint")).toBeNull();
  });

  it("leaves React's camera alone when the paint has no camera override", () => {
    const svg = svgWithPlayer("x", 316, 452);
    svg.setAttribute("data-base-viewbox", "40 20 800 496");
    svg.setAttribute("viewBox", "40 20 800 496");
    applyLiveFieldPaint(svg, {
      move: {
        dx: 8,
        dy: 0,
        playerIds: ["x"],
        pathIds: [],
        labelIds: [],
      },
    });
    expect(svg.getAttribute("viewBox")).toBe("40 20 800 496");
  });
});
