import { useState } from "react";
import type { DefensiveAdjustment } from "@chalk/editor";

export interface DefensiveTip {
  id: string;
  title: string;
  category: "Coverage" | "Run defense" | "Reads & scramble";
  when: string;
  steps: readonly string[];
  aim: string;
  watch: string;
  adjustments?: readonly DefensiveAdjustment[];
}

const defensiveTips: readonly DefensiveTip[] = [
  {
    id: "quick-flats",
    title: "Stop Quick Flats and RPOs",
    category: "Coverage",
    when: "Use this when the offense keeps taking easy short completions.",
    steps: [
      "Open Defensive adjustments and choose Entire defense.",
      "Set coverage to Aggressive.",
      "Shade underneath to bring the zone landmarks down.",
      "Check the corner route behind the flat defender.",
      "Give an intermediate defender a pass key and review the window he must protect.",
    ],
    aim: "Contest the quick throw and make the offense work for short yards.",
    watch:
      "Underneath emphasis can leave space behind it. Keep a defender responsible for the corner route.",
    adjustments: [
      { kind: "coverage", technique: "aggressive" },
      { kind: "coverage", technique: "underneath" },
    ],
  },
  {
    id: "deep-posts",
    title: "Stop Deep Posts",
    category: "Coverage",
    when: "Use this when the offense is attacking the deep middle.",
    steps: [
      "Open Defensive adjustments and choose Entire defense.",
      "Shade overtop.",
      "Commit inside if posts are the main threat.",
      "Back off when the outside receivers are threatening to run past the corners.",
      "Review the deep-middle responsibility and the space left outside.",
    ],
    aim: "Protect the deep middle and reduce clean vertical throwing windows.",
    watch:
      "Extra depth concedes space underneath. Check the flats and comeback routes before committing to the setup.",
    adjustments: [
      { kind: "coverage", technique: "overtop" },
      { kind: "coverage", technique: "inside" },
      { kind: "coverage", technique: "back-off" },
    ],
  },
  {
    id: "inside-runs",
    title: "Stop Inside Runs",
    category: "Run defense",
    when: "Use this when inside zone, dive, or power is finding clean interior lanes.",
    steps: [
      "Open Defensive adjustments and choose Entire defense.",
      "Pinch the D-line's alignment.",
      "Review the linebackers' gaps and zone responsibilities.",
      "Show blitz if you want a tighter pre-snap box.",
      "Check the play-action routes before sending additional pressure.",
    ],
    aim: "Tighten the interior alignment and show a crowded box.",
    watch:
      "A blitz look does not send a blitzer. Check edge contain and the gaps created by the pinch.",
    adjustments: [
      { kind: "front-spacing", spread: false },
      { kind: "show-blitz", on: true },
    ],
  },
  {
    id: "read-option",
    title: "Separate the Read from the Response",
    category: "Reads & scramble",
    when: "Use this when you are teaching how a read option or RPO attacks a defender.",
    steps: [
      "Put the offense and defense on the field.",
      "Select the defender the offense reads.",
      "Set his Offense read key to Option Read, Pitch Key, RPO Read, or Pass Key.",
      "Choose an offensive player to watch and assign a Defensive read separately.",
      "Check who is responsible for the back, quarterback, pitch, and pass threat.",
    ],
    aim: "Make both sides of the decision visible on the diagram.",
    watch:
      "The read key names a decision. It does not automatically assign every run fit or coverage job.",
  },
  {
    id: "contain-plaster",
    title: "Contain and Plaster",
    category: "Reads & scramble",
    when: "Use this when the quarterback extends plays outside the pocket.",
    steps: [
      "Give the edge rushers Contain.",
      "Keep the base coverage assignments.",
      "Choose a defender under Read keys & plaster.",
      "Choose his Plaster receiver.",
      "Review the dotted scramble alternative alongside the original coverage.",
    ],
    aim: "Pair edge responsibility with an explicit scramble response.",
    watch:
      "The dotted line is conditional coaching, not a second assignment at the snap.",
    adjustments: [{ kind: "contain" }],
  },
  {
    id: "secondary-spacing",
    title: "Set the Secondary's Depth and Width",
    category: "Coverage",
    when: "Use this when a formation's splits or vertical threats call for a different cushion.",
    steps: [
      "Select the corner or safety you want to adjust, or choose Entire defense.",
      "Set corner depth in yards off the ball.",
      "Set safety depth independently.",
      "Set width from the ball on each defender's current side.",
      "Check the coverage landmarks and receiver matchups after the alignment changes.",
    ],
    aim: "Make the intended cushion and spacing explicit.",
    watch:
      "Moving a stance keeps the defender's zone or rush destination. Review the line from the new position.",
  },
];

export function TipsPage({
  canApply,
  onApply,
  onOpenAdjustments,
}: {
  canApply: boolean;
  onApply: (tip: DefensiveTip) => void;
  onOpenAdjustments: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All tips");
  const shown = defensiveTips.filter(
    (tip) =>
      (category === "All tips" || tip.category === category) &&
      `${tip.title} ${tip.when} ${tip.steps.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <main className="tips-page" aria-label="Coaching tips">
      <header className="tips-heading">
        <div>
          <span className="section-heading">Chalk coaching guide</span>
          <h1>Defensive tips</h1>
          <p>
            Start with a problem. Build the look, check the tradeoff, and coach
            the responsibility.
          </p>
        </div>
        <button type="button" onClick={onOpenAdjustments}>
          Open defensive adjustments
        </button>
      </header>
      <div className="tips-controls">
        <input
          aria-label="Search tips"
          type="search"
          placeholder="Search coverage, RPO, contain…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div role="group" aria-label="Tip categories">
          {["All tips", "Coverage", "Run defense", "Reads & scramble"].map(
            (value) => (
              <button
                type="button"
                key={value}
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
              >
                {value}
              </button>
            ),
          )}
        </div>
      </div>
      <p className="tips-intro">
        These setups use Chalk's controls. Apply setup changes the current
        defense in one undoable step; read targets and plaster receivers are
        chosen in Defensive adjustments.
      </p>
      {!canApply ? (
        <p className="tips-empty-defense">
          Add a defense in the editor to try a setup on the field.
        </p>
      ) : null}
      <div className="tips-grid">
        {shown.map((tip, index) => (
          <article key={tip.id} className="tip-card" aria-label={tip.title}>
            <div className="tip-eyebrow">
              <span>{tip.category}</span>
              <span aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>
            <h2>{tip.title}</h2>
            <p>{tip.when}</p>
            <ol>
              {tip.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="tip-aim">
              <strong>Aim</strong>
              <p>{tip.aim}</p>
            </div>
            <div className="tip-watch">
              <strong>Watch for</strong>
              <p>{tip.watch}</p>
            </div>
            <button
              type="button"
              disabled={!canApply}
              onClick={() =>
                tip.adjustments ? onApply(tip) : onOpenAdjustments()
              }
            >
              {tip.adjustments ? "Apply setup" : "Choose responsibilities"}
            </button>
          </article>
        ))}
      </div>
      {shown.length === 0 ? (
        <p role="status">No tips match this search.</p>
      ) : null}
      <footer className="tips-footer">
        Defensive setup examples for Chalk. Further reading:{" "}
        <a
          href="https://blogs.usafootball.com/blog/4162/rpo-how-to-defend-the-run-pass-option"
          target="_blank"
          rel="noreferrer"
        >
          USA Football on defending RPOs
        </a>{" "}
        ·{" "}
        <a
          href="https://www.nfl.com/news/how-detroit-must-defend-aaron-rodgers-cowboys-conundrum-0ap3000000766250"
          target="_blank"
          rel="noreferrer"
        >
          Contain and plaster
        </a>
      </footer>
    </main>
  );
}
