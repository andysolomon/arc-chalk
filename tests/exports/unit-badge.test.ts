import { starterExamplePlays } from "@chalk/domain";
import { unitPalette } from "@chalk/render";
import { describe, expect, it } from "vitest";

import {
  binderHtml,
  bookEntriesOf,
  classificationHtml,
  defaultBinderConfig,
  installPageHtml,
  UNIT_BADGE_CSS,
  unitBadgeHtml,
} from "@chalk/exports";

const plays = starterExamplePlays();
const offense = plays.find((play) => play.unit === "offense")!;
const defense = plays.find((play) => play.unit === "defense")!;

describe("unit badges on paper (issue #73)", () => {
  it("prints the Unit as a labeled badge in its own accent, and the Type as text", () => {
    expect(unitBadgeHtml("offense")).toBe(
      '<span class="ub" data-unit="offense">Offense</span>',
    );
    expect(classificationHtml(offense)).toBe(
      `<span class="ub" data-unit="offense">Offense</span> · ${offense.playType!.name}`,
    );
    expect(classificationHtml({ unit: "defense" })).toBe(
      '<span class="ub" data-unit="defense">Defense</span>',
    );
    for (const [unit, { accent, tint }] of Object.entries(unitPalette)) {
      expect(UNIT_BADGE_CSS).toContain(
        `.ub[data-unit="${unit}"]{color:${accent};background:${tint}}`,
      );
    }
    // Colour survives the printer's default, and monochrome desaturates it
    // to a bordered label rather than dropping it.
    expect(UNIT_BADGE_CSS).toContain("print-color-adjust:exact");
    expect(UNIT_BADGE_CSS).toContain("border:1px solid currentColor");
  });

  it("carries the same badge on a teaching page and a binder cover", () => {
    const render = () => "<svg></svg>";
    const page = installPageHtml(defense, { render, formations: [] });
    expect(page).toContain(UNIT_BADGE_CSS);
    expect(page).toContain(
      '<span><span class="ub" data-unit="defense">Defense</span>',
    );
    const binder = binderHtml(
      bookEntriesOf({ plays: [offense] }),
      defaultBinderConfig,
      { render, year: 2026, title: "Week 5", unit: "offense" },
    );
    expect(binder).toContain(
      '<div class="cs"><span class="ub" data-unit="offense">Offense</span></div>',
    );
  });
});
