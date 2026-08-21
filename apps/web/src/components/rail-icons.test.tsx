import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RailIcon, type RailGlyph } from "./rail-icons";

const paths = (glyph: RailGlyph): string[] => {
  const { container } = render(<RailIcon glyph={glyph} />);
  const svg = container.querySelector("svg");
  expect(svg).toHaveAttribute("viewBox", "0 0 18 18");
  expect(svg).toHaveAttribute("width", "18");
  expect(svg).toHaveAttribute("height", "18");
  // The original stamps stroke on each mark. A wrapping group outlines the
  // Text "T" and is how these drawings used to disagree below Text.
  expect(svg?.querySelector("g")).toBeNull();
  return [...(svg?.querySelectorAll("path") ?? [])].map(
    (path) => path.getAttribute("d") ?? "",
  );
};

describe("RailIcon", () => {
  it("is the original's 18-unit artwork, including erase and snap below Text", () => {
    expect(paths("select")).toEqual([
      "M4.5 2.5 L4.5 14.5 L8 11.6 L10 16 L12 15.1 L10 10.8 L14.5 10.5 Z",
    ]);
    expect(paths("route")).toEqual([
      "M3.5 15 L9.5 15 L9.5 5",
      "M6.5 7.5 L9.5 4 L12.5 7.5",
    ]);
    expect(paths("motion")).toEqual([
      "M2.5 12.5 L10.5 12.5",
      "M9.5 9 L13 12.5 L9.5 16",
    ]);
    expect(paths("block")).toEqual(["M9 15.5 L9 6.5", "M4.5 6.5 L13.5 6.5"]);
    expect(paths("zone")).toEqual(["M3 15.5 L7.5 10"]);
    expect(paths("snap")).toEqual([
      "M4 3.5 L4 14.5 L15 14.5",
      "M4 8.5 A6 6 0 0 1 10 14.5",
    ]);
    expect(paths("erase")).toEqual([
      "M3 15.2 L15 15.2",
      "M6.4 15.2 L3.6 12.1 L10.2 3.6 L14 6.4 Z",
      "M7.2 9.1 L11.4 12.2",
    ]);

    const { container: text } = render(<RailIcon glyph="text" />);
    const letter = text.querySelector("text");
    expect(letter).toHaveTextContent("T");
    expect(letter).not.toHaveAttribute("stroke");

    const { container: player } = render(<RailIcon glyph="player" />);
    const circle = player.querySelector("circle");
    expect(circle).toHaveAttribute("cx", "9");
    expect(circle).toHaveAttribute("cy", "9");
    expect(circle).toHaveAttribute("r", "5.5");
  });
});
