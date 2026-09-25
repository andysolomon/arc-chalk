import { describe, expect, it } from "vitest";

import { printFieldHtml, svgMarkupForPrint } from "./print-field";

describe("printFieldHtml", () => {
  it("escapes the play name and category so a quote cannot break the sheet", () => {
    const html = printFieldHtml({
      playName: 'Mesh <Alert> & "Go"',
      category: "RPO & Screen",
      svgMarkup: "<svg></svg>",
    });

    expect(html).toContain('<h1>Mesh &lt;Alert&gt; &amp; "Go"</h1>');
    expect(html).toContain("<span>RPO &amp; Screen</span>");
  });
});

describe("svgMarkupForPrint", () => {
  it("resets the live field to the full frame and drops editor chrome", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "field-diagram");
    svg.setAttribute("viewBox", "40 20 200 100");
    const halo = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    halo.setAttribute("data-print-chrome", "");
    halo.setAttribute("class", "selection-halo");
    svg.append(halo);
    const player = document.createElementNS("http://www.w3.org/2000/svg", "g");
    player.setAttribute("data-scene-player", "q");
    svg.append(player);
    const markup = svgMarkupForPrint(svg, { width: 1000, height: 620 });

    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(markup).toContain('viewBox="0 0 1000 620"');
    expect(markup).not.toContain("field-diagram");
    expect(markup).not.toContain("selection-halo");
    expect(markup).toContain('data-scene-player="q"');
  });
});
