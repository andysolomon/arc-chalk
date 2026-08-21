import { afterEach, describe, expect, it, vi } from "vitest";

import {
  openPrintField,
  printFieldHtml,
  svgMarkupForPrint,
} from "./print-field";

describe("printFieldHtml", () => {
  it("is the original's letter-landscape field sheet", () => {
    const html = printFieldHtml({
      playName: "Stick — Thunder",
      category: "Pass",
      svgMarkup: "<svg viewBox='0 0 10 10'></svg>",
      productName: "Chalk",
    });

    expect(html).toContain("<title>Stick — Thunder \u2014 Chalk</title>");
    expect(html).toContain("@page{size:letter landscape;margin:0.5in}");
    expect(html).toContain(".field-paper{fill:#fff;stroke:#e5e5e5}");
    expect(html).toContain("<h1>Stick — Thunder</h1>");
    expect(html).toContain("<span>Pass</span>");
    expect(html).toContain("<svg viewBox='0 0 10 10'></svg>");
    expect(html).toContain('<div class="__pf">Chalk</div>');
  });

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

describe("openPrintField", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("writes the sheet and asks the browser to print", () => {
    vi.useFakeTimers();
    const popup = {
      document: { write: vi.fn(), close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
    };
    const open = vi.fn(() => popup as unknown as Window);

    openPrintField(
      {
        playName: "Stick — Thunder",
        category: "Pass",
        svgMarkup: "<svg></svg>",
      },
      open,
    );

    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(popup.document.write).toHaveBeenCalledWith(
      expect.stringContaining("<h1>Stick — Thunder</h1>"),
    );
    expect(popup.document.close).toHaveBeenCalled();
    expect(popup.print).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    expect(popup.focus).toHaveBeenCalled();
    expect(popup.print).toHaveBeenCalled();
  });
});
