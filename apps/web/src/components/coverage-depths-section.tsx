import {
  CORNER_DEPTH_CHOICES,
  SAFETY_DEPTH_CHOICES,
  type CoverageDepths,
} from "@chalk/domain";

const yards = (value: number) => (value === 1 ? "1 yard" : `${value} yards`);

/**
 * Coverage defaults (ADR 0061): how far off the ball the Coach wants his
 * corners and his deep safeties, set once for the Playbook the way a video
 * game's coach adjustments are. Every call he puts on, and every reset back
 * to one, stands them there; "As the call draws it" leaves the call alone.
 */
export function CoverageDepthsSection({
  depths,
  onChange,
}: {
  depths: CoverageDepths | undefined;
  onChange: (depths: CoverageDepths) => void;
}) {
  const pick = (field: keyof CoverageDepths, value: string) => {
    const next: { -readonly [Key in keyof CoverageDepths]: number } = {
      ...depths,
    };
    if (value === "") delete next[field];
    else next[field] = Number(value);
    onChange(next);
  };
  return (
    <div
      aria-label="Coverage defaults"
      className="coverage-depths"
      role="group"
    >
      <span className="section-heading">Coverage defaults</span>
      <label className="settings-field">
        <span className="settings-field-label">Corners off the ball</span>
        <select
          onChange={(event) => pick("cornerYards", event.target.value)}
          value={depths?.cornerYards ?? ""}
        >
          <option value="">As the call draws it</option>
          {CORNER_DEPTH_CHOICES.map((value) => (
            <option key={value} value={value}>
              {value === 1 ? "Press — 1 yard" : yards(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="settings-field">
        <span className="settings-field-label">Deep safeties off the ball</span>
        <select
          onChange={(event) => pick("safetyYards", event.target.value)}
          value={depths?.safetyYards ?? ""}
        >
          <option value="">As the call draws it</option>
          {SAFETY_DEPTH_CHOICES.map((value) => (
            <option key={value} value={value}>
              {yards(value)}
            </option>
          ))}
        </select>
      </label>
      <p>
        Every defense you put on, and every reset back to one, stands its
        corners and deep safeties here. In Cover 0 the men in man then line up
        on their receivers at that depth; with a safety deep behind them they
        stay where the call puts them.
      </p>
    </div>
  );
}
