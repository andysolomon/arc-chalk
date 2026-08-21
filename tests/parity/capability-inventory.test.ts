import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const originalHtml = await readFile("Chalk Play Editor.dc.html", "utf8");
const commandSurface = await readFile(
  "apps/web/src/components/editor-command-surface.ts",
  "utf8",
);

/** Exact `shortcutRows` pairs copied from the canonical prototype source. */
const shortcutRows = [
  ["Select", "V"],
  ["Player", "P"],
  ["Route", "R"],
  ["Motion", "M"],
  ["Block", "B"],
  ["Zone drop", "Z"],
  ["Text", "T"],
  ["Focus mode — both panels", "F"],
  ["Inspector on / off", "⌥1"],
  ["Tools on / off", "⌥2"],
  ["Fit to selection", "⌘2"],
  ["Leave present / print", "esc"],
  ["Formations", "⇧⌘F"],
  ["Defenses", "⇧⌘D"],
  ["Snapping on / off", "S"],
  ["Command palette", "⌘K"],
  ["This panel", "?"],
  ["Undo / redo", "⌘Z / ⇧⌘Z"],
  ["Save · variant · snapshot", "⌘S"],
  ["Duplicate", "⌘D"],
  ["Select all", "⌘A"],
  ["Fit field", "⌘0"],
  ["Zoom in / out", "⌘= / ⌘-"],
  ["Pan the field", "space-drag, alt-drag or two fingers"],
  ["Zoom to cursor", "scroll or pinch"],
  ["Pan sideways", "shift-scroll"],
  ["Menu on a player or route", "right-click or long-press"],
  ["Add to selection", "shift-click"],
  ["Marquee select", "drag empty field"],
  ["Add a node", "double-click a line"],
  ["Exact depth while drawing", "type a number"],
  ["Read order on a route", "1–9"],
  ["Copy / paste", "⌘C / ⌘V"],
  ["Group / ungroup", "⌘G / ⇧⌘G"],
  ["Forward / backward", "⌘] / ⌘["],
  ["Finish route", "Enter or double-click"],
  ["Cancel", "Esc"],
  ["Remove last point", "⌫ while drawing"],
  ["Delete selection", "⌫"],
] as const;

const exportLabels = [
  "Download PNG",
  "Download SVG",
  "Print the field",
  "Install page",
  "Position view",
  "Quiz + answer key",
  "Receivers",
  "Backs",
  "Line",
  "QB",
  "Defense",
  "Scout card — 4-up",
  "Practice cards — 2-up",
  "Call sheet",
  "Full playbook",
] as const;

const moreMenuNames = [
  "Focus mode",
  "Hide zone areas",
  "Mirror",
  "Flip strength",
  "New play",
] as const;

const clearLabels = [
  "Coverage",
  "Routes",
  "Offense",
  "Defense",
  "Text",
  "All",
] as const;

const persistenceKeys = [
  "current.v1",
  "plays.v1",
  "examples.v15",
  "chrome.v1",
  "history.v1",
  "favdefenses.v1",
  "favformations.v1",
  "formations.v1",
  "libraryOpen.v1",
] as const;

describe("canonical prototype command-surface inventory", () => {
  it("lists every shortcut row in the restored original", () => {
    for (const [what, key] of shortcutRows) {
      expect(originalHtml).toContain(`['${what}','${key}']`);
    }
  });

  it("locks production shortcutRows to the original pairs", () => {
    for (const [what, key] of shortcutRows) {
      expect(commandSurface).toContain(`["${what}", "${key}"]`);
    }
  });

  it("lists every Export menu label in both sources", () => {
    for (const label of exportLabels) {
      expect(originalHtml).toContain(label);
      expect(commandSurface).toContain(label);
    }
    expect(originalHtml).toContain("DIAGRAM");
    expect(originalHtml).toContain("TEACHING");
    expect(originalHtml).toContain("FIELD");
    expect(originalHtml).toContain("BOOK");
    expect(commandSurface).toContain('"DIAGRAM"');
    expect(commandSurface).toContain('"TEACHING"');
    expect(commandSurface).toContain('"FIELD"');
    expect(commandSurface).toContain('"BOOK"');
  });

  it("lists the More menu verbs in both sources", () => {
    for (const name of moreMenuNames) {
      expect(originalHtml).toContain(name);
      expect(commandSurface).toContain(name);
    }
  });

  it("lists the Clear-menu layer names in both sources", () => {
    for (const label of clearLabels) {
      expect(originalHtml).toContain(`>${label}<`);
      expect(commandSurface).toContain(`label: "${label}"`);
    }
  });

  it("names every localStorage key the original owns", () => {
    expect(originalHtml).toContain("NS = 'fpd.'");
    for (const key of persistenceKeys) {
      expect(originalHtml).toContain(`this.K('${key}')`);
    }
  });
});
