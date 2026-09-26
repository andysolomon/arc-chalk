import {
  defensivePersonnelOf,
  defensiveFronts,
  formationFamilies,
  formationGroupOf,
  formationMeta,
  offensivePackageOf,
  playUnits,
  STOCK_PLAYBOOK_ID,
  type DefensiveCall,
  type Formation,
  type PlayUnit,
} from "@chalk/domain";
import type { PlaySearchProjection, PlaybookSummary } from "@chalk/local-db";
import { useMemo, useState } from "react";

import { defenseThumbnail } from "../components/defense-thumbnail";
import { FavoriteStar } from "../components/editor-overlays";
import { formationThumbnail } from "../components/formation-thumbnail";
import { ANY, FilterChip, type FilterChoice } from "./filter-chip";
import { countBy, personnelChoices, setChoices } from "./play-filters";

/**
 * One card of the Formations page: a set of the offense or a call of the
 * defense, described the same way so one row of filters reaches both. On
 * offense the group is what the set is called from, the set its family and
 * the package what its personnel puts on the field; on defense the group is
 * the front, the set the coverage, and the personnel Base, Nickel or Dime.
 */
interface FormationCard {
  readonly id: string;
  readonly unit: PlayUnit;
  readonly name: string;
  readonly playbookId: string;
  readonly group: string;
  readonly set: string;
  readonly setName: string;
  readonly personnel: string;
  readonly package?: string;
  readonly strength?: string;
  readonly description: string;
  readonly favorite: boolean;
  readonly custom: boolean;
  readonly plays: number;
  readonly formation?: Formation;
  readonly call?: DefensiveCall;
}

/** How the chips read once a side of the ball is chosen. */
const AXIS_NAMES: Record<
  "all" | PlayUnit,
  { readonly group: string; readonly set: string }
> = {
  all: { group: "Formation", set: "Set" },
  offense: { group: "Formation", set: "Set" },
  defense: { group: "Front", set: "Coverage" },
};

const wordOrder = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

const stockGroupOrder = ["Gun", "Pistol", "Empty", "I-Form", "Strong"];

function groupRank(card: FormationCard): number {
  if (card.unit === "defense") {
    const at = defensiveFronts.indexOf(card.group);
    return 100 + (at < 0 ? defensiveFronts.length : at);
  }
  const at = stockGroupOrder.indexOf(card.group);
  return at < 0 ? stockGroupOrder.length : at;
}

export function FormationsPage({
  calls,
  favoriteCallIds,
  favoriteFormationIds,
  focusSearch = true,
  formations,
  members,
  onRemove,
  onShowPlays,
  onToggleFavoriteCall,
  onToggleFavoriteFormation,
  playbooks,
}: {
  calls: readonly DefensiveCall[];
  favoriteCallIds: readonly string[];
  favoriteFormationIds: readonly string[];
  focusSearch?: boolean;
  /** Every set, shipped and saved. */
  formations: readonly Formation[];
  /** The Plays of the open book, to say how many stand in each set. */
  members: readonly PlaySearchProjection[];
  /** Lets a set the Coach saved go. */
  onRemove: (formationId: string) => void;
  /** Opens the Plays page on the Plays that stand in this set. */
  onShowPlays: (formationId: string) => void;
  onToggleFavoriteCall: (callId: string) => void;
  onToggleFavoriteFormation: (formationId: string) => void;
  playbooks: readonly PlaybookSummary[];
}) {
  const [query, setQuery] = useState("");
  const [unit, setUnit] = useState<"all" | PlayUnit>("all");
  const [playbookId, setPlaybookId] = useState(ANY);
  const [group, setGroup] = useState(ANY);
  const [set, setSet] = useState(ANY);
  const [personnel, setPersonnel] = useState(ANY);
  const [pkg, setPackage] = useState(ANY);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const cards = useMemo((): readonly FormationCard[] => {
    const playsIn = countBy(members, (member) => member.formationId);
    const starredSets = new Set(favoriteFormationIds);
    const starredCalls = new Set(favoriteCallIds);
    const families = new Map(
      formationFamilies.map((family) => [family.key, family]),
    );
    const sets = formations.map((formation): FormationCard => {
      const meta = formationMeta(formation.slots, {
        personnelLabel: formation.personnelLabel,
        strength: formation.strength,
      });
      const family = formation.family ?? "custom";
      return {
        id: formation.id,
        unit: "offense",
        name: formation.name,
        playbookId: formation.playbookId,
        group: formationGroupOf(formation),
        set: family,
        setName: families.get(family)?.shortName ?? family,
        personnel: meta.personnelLabel,
        package: offensivePackageOf(meta.personnelLabel),
        strength: meta.strength,
        description: formation.description,
        favorite: starredSets.has(formation.id),
        custom: family === "custom",
        plays: playsIn.get(formation.id) ?? 0,
        formation,
      };
    });
    const defenses = calls.map((call): FormationCard => {
      return {
        id: call.formation.id,
        unit: "defense",
        name: call.formation.name,
        playbookId: call.formation.playbookId,
        group: call.front,
        set: call.coverage,
        setName: call.coverage,
        personnel: defensivePersonnelOf(call.front),
        description: call.formation.description,
        favorite: starredCalls.has(call.formation.id),
        custom: false,
        plays: 0,
        call,
      };
    });
    return [...sets, ...defenses];
  }, [calls, favoriteCallIds, favoriteFormationIds, formations, members]);

  const inUnit = cards.filter((card) => unit === ANY || card.unit === unit);
  const search = query.trim().toLowerCase();
  const shown = inUnit.filter(
    (card) =>
      (!favoritesOnly || card.favorite) &&
      (playbookId === ANY || card.playbookId === playbookId) &&
      (group === ANY || card.group === group) &&
      (set === ANY || card.set === set) &&
      (personnel === ANY || card.personnel === personnel) &&
      (pkg === ANY || card.package === pkg) &&
      (!search ||
        `${card.name} ${card.group} ${card.setName} ${card.personnel} ${
          card.package ?? ""
        } ${card.strength ?? ""} ${card.description}`
          .toLowerCase()
          .includes(search)),
  );

  const bookNames = new Map(playbooks.map(({ id, name }) => [id, name]));
  const choicesOf = (
    facet: (card: FormationCard) => string | undefined,
    name: (value: string) => string = (value) => value,
  ): readonly FilterChoice[] =>
    [...countBy(inUnit, facet).entries()]
      .sort(([left], [right]) => wordOrder.compare(left, right))
      .map(([value, count]) => ({ value, name: name(value), count }));

  const axis = AXIS_NAMES[unit];
  const groupChoices = [...countBy(inUnit, (card) => card.group).entries()]
    .map(([value, count]) => ({
      value,
      count,
      rank: groupRank(
        inUnit.find((card) => card.group === value) ?? inUnit[0]!,
      ),
    }))
    .sort(
      (left, right) =>
        left.rank - right.rank || wordOrder.compare(left.value, right.value),
    )
    .map(({ value, count }) => ({ value, name: value, count }));
  const setChoiceList: readonly FilterChoice[] =
    unit === "defense"
      ? choicesOf((card) => card.set)
      : [
          ...setChoices(
            countBy(
              inUnit.filter((card) => card.unit === "offense"),
              (card) => card.set,
            ),
          ),
          ...(unit === ANY
            ? choicesOf((card) =>
                card.unit === "defense" ? card.set : undefined,
              )
            : []),
        ];
  const personnelChoiceList = personnelChoices(
    countBy(inUnit, (card) => card.personnel),
  );
  const packageChoices = choicesOf((card) => card.package);
  const narrowed =
    search !== "" ||
    unit !== ANY ||
    favoritesOnly ||
    [playbookId, group, set, personnel, pkg].some((value) => value !== ANY);

  const clear = () => {
    setQuery("");
    setUnit(ANY);
    setPlaybookId(ANY);
    setGroup(ANY);
    setSet(ANY);
    setPersonnel(ANY);
    setPackage(ANY);
    setFavoritesOnly(false);
  };

  // A Type belongs to its side of the ball: a front chosen under Defense
  // means nothing once Offense is chosen, so the axes open back up.
  const chooseUnit = (next: "all" | PlayUnit) => {
    setUnit(next);
    setGroup(ANY);
    setSet(ANY);
    setPersonnel(ANY);
    setPackage(ANY);
  };

  const groups = [
    ...new Map(
      [...shown]
        .sort(
          (left, right) =>
            groupRank(left) - groupRank(right) ||
            wordOrder.compare(left.group, right.group),
        )
        .map((card) => [`${card.unit}:${card.group}`, card] as const),
    ).values(),
  ].map((lead) => ({
    key: `${lead.unit}:${lead.group}`,
    unit: lead.unit,
    name: lead.unit === "defense" ? `${lead.group} front` : lead.group,
    cards: [...shown]
      .filter((card) => card.unit === lead.unit && card.group === lead.group)
      .sort(
        (left, right) =>
          Number(right.favorite) - Number(left.favorite) ||
          wordOrder.compare(left.name, right.name),
      ),
  }));

  return (
    <div
      aria-label="Formations"
      className="browser formations-page"
      role="region"
    >
      <div className="playbook-tools">
        <div className="playbook-search">
          <svg
            aria-hidden="true"
            className="playbook-search-glyph"
            viewBox="0 0 16 16"
          >
            <circle cx="7" cy="7" fill="none" r="4.75" strokeWidth="1.5" />
            <path
              d="m10.5 10.5 3.25 3.25"
              strokeLinecap="round"
              strokeWidth="1.5"
            />
          </svg>
          <input
            aria-label="Search formations"
            autoFocus={focusSearch}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search formations — gun, trips, nickel, 12…"
            spellCheck={false}
            value={query}
          />
        </div>
        <div
          aria-label="Filter formations"
          className="playbook-filters playbook-filters-menus"
          role="group"
        >
          {playUnits.map((choice) => (
            <button
              aria-pressed={unit === choice.id}
              className={unit === choice.id ? "chip active" : "chip"}
              data-unit={choice.id}
              key={choice.id}
              onClick={() => chooseUnit(unit === choice.id ? ANY : choice.id)}
              type="button"
            >
              {choice.name}
            </button>
          ))}
          <span aria-hidden="true" className="playbook-filters-rule" />
          <FilterChip
            choices={[
              {
                value: STOCK_PLAYBOOK_ID,
                name: "Shipped with Chalk",
                count: inUnit.filter(
                  (card) => card.playbookId === STOCK_PLAYBOOK_ID,
                ).length,
              },
              ...playbooks.map((book) => ({
                value: book.id,
                name: bookNames.get(book.id) ?? book.name,
                count: inUnit.filter((card) => card.playbookId === book.id)
                  .length,
              })),
            ]}
            focusSearch={focusSearch}
            label="Playbook"
            onPick={setPlaybookId}
            value={playbookId}
          />
          <FilterChip
            choices={groupChoices}
            focusSearch={focusSearch}
            label={axis.group}
            onPick={setGroup}
            value={group}
          />
          <FilterChip
            choices={setChoiceList}
            focusSearch={focusSearch}
            label={axis.set}
            onPick={setSet}
            value={set}
          />
          <FilterChip
            choices={personnelChoiceList}
            focusSearch={focusSearch}
            label="Personnel"
            onPick={setPersonnel}
            value={personnel}
          />
          {unit !== "defense" ? (
            <FilterChip
              choices={packageChoices}
              focusSearch={focusSearch}
              label="Package"
              onPick={setPackage}
              value={pkg}
            />
          ) : null}
          <button
            aria-pressed={favoritesOnly}
            className={favoritesOnly ? "chip active" : "chip"}
            onClick={() => setFavoritesOnly((on) => !on)}
            title="Only what you starred"
            type="button"
          >
            ★ Favorites
          </button>
        </div>
        <div className="playbook-summary">
          <span aria-live="polite" className="playbook-count">
            {narrowed
              ? `${shown.length} of ${cards.length} formations`
              : `${cards.length} formations`}
          </span>
          {narrowed ? (
            <button className="playbook-clear" onClick={clear} type="button">
              Clear
            </button>
          ) : null}
        </div>
      </div>
      <div className="browser-body formations-scroll">
        {groups.map((section) => (
          <div key={section.key}>
            <div className="browser-group-head">
              <span>{section.name}</span>
              <span className="browser-count">{section.cards.length}</span>
            </div>
            <div className="browser-grid formations-grid">
              {section.cards.map((card) =>
                card.formation ? (
                  <SetCard
                    card={card}
                    formation={card.formation}
                    key={card.id}
                    onRemove={onRemove}
                    onShowPlays={onShowPlays}
                    onToggleFavorite={onToggleFavoriteFormation}
                  />
                ) : card.call ? (
                  <CallCard
                    call={card.call}
                    card={card}
                    key={card.id}
                    onToggleFavorite={onToggleFavoriteCall}
                  />
                ) : null,
              )}
            </div>
          </div>
        ))}
        {groups.length === 0 ? (
          <div className="playbook-none">
            <strong>No formations match</strong>
            <button className="playbook-clear" onClick={clear} type="button">
              Clear search and filters
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A set: its shape, its name, and the Plays that stand in it. */
function SetCard({
  card,
  formation,
  onRemove,
  onShowPlays,
  onToggleFavorite,
}: {
  card: FormationCard;
  formation: Formation;
  onRemove: (formationId: string) => void;
  onShowPlays: (formationId: string) => void;
  onToggleFavorite: (formationId: string) => void;
}) {
  const shape = formationThumbnail(formation);
  const plays =
    card.plays === 0
      ? "No plays yet"
      : `${card.plays} ${card.plays === 1 ? "play" : "plays"}`;
  return (
    <div
      className="browser-card formation-card"
      data-formation-id={formation.id}
      data-unit="offense"
    >
      <button
        aria-label={`${formation.name} — ${plays}`}
        className="formation-open"
        onClick={() => onShowPlays(formation.id)}
        title="See the plays in this set"
        type="button"
      >
        <div className="browser-shape">
          <svg role="presentation" viewBox="0 0 140 74">
            <line
              stroke="#E5E5E5"
              strokeWidth={1}
              x1={4}
              x2={136}
              y1={shape.lineOfScrimmage}
              y2={shape.lineOfScrimmage}
            />
            {shape.dots.map((dot, index) => (
              <circle
                cx={dot.x}
                cy={dot.y}
                fill={dot.filled ? "#171717" : "#FFFFFF"}
                key={index}
                r={3.4}
                stroke="#171717"
                strokeWidth={1}
              />
            ))}
          </svg>
        </div>
      </button>
      <div className="browser-name-row">
        <button
          className="browser-name"
          onClick={() => onShowPlays(formation.id)}
          type="button"
        >
          {formation.name}
        </button>
        <FavoriteStar
          favorite={card.favorite}
          onToggle={() => onToggleFavorite(formation.id)}
        />
        {card.custom ? (
          <button
            aria-label={`Remove ${formation.name}`}
            className="browser-remove"
            onClick={() => onRemove(formation.id)}
            title="Remove this formation"
            type="button"
          >
            ×
          </button>
        ) : null}
      </div>
      <span className="browser-chip">
        {card.personnel} · {card.package} · {card.strength?.toUpperCase()}
        <em className="formation-plays">{plays}</em>
      </span>
    </div>
  );
}

/** A defensive call: front and coverage, drawn as the editor's own book draws it. */
function CallCard({
  call,
  card,
  onToggleFavorite,
}: {
  call: DefensiveCall;
  card: FormationCard;
  onToggleFavorite: (callId: string) => void;
}) {
  const shape = defenseThumbnail(call, false);
  return (
    <div
      className="browser-card formation-card"
      data-formation-id={call.formation.id}
      data-unit="defense"
    >
      <div className="browser-shape">
        <svg role="presentation" viewBox="0 0 180 96">
          <line
            stroke="#E5E5E5"
            strokeWidth={1}
            x1={4}
            x2={176}
            y1={shape.lineOfScrimmage}
            y2={shape.lineOfScrimmage}
          />
          {shape.line.map((dot, index) => (
            <circle
              cx={dot.x}
              cy={dot.y}
              fill="#FFFFFF"
              key={index}
              r={3}
              stroke="#D4D4D4"
              strokeWidth={1}
            />
          ))}
          {shape.defenders.map((dot, index) => (
            <circle cx={dot.x} cy={dot.y} fill="#171717" key={index} r={4.6} />
          ))}
        </svg>
      </div>
      <div className="browser-name-row">
        <strong className="browser-name formation-call-name">
          {call.formation.name}
        </strong>
        <FavoriteStar
          favorite={card.favorite}
          onToggle={() => onToggleFavorite(call.formation.id)}
        />
      </div>
      <span className="browser-chip">
        {card.personnel} · {call.coverage} · {call.formation.slots.length} men
      </span>
    </div>
  );
}
