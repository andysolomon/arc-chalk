import { applyFormation } from "./formations";
import { stockFormations } from "./formation-catalogue";
import {
  attachPlayToConcept,
  copyPlayDocument,
  createVariationPlay,
} from "./library";
import { stickThunderPlay } from "./seed-stick-thunder";
import { demoTour } from "./demo-catalogue";
import { builtInPlayTypeDefinitions } from "./classifications";
import type { Concept, PlayDocument, PlaybookEnvelope } from "./schema";

export const STICK_THUNDER_CONCEPT_ID = "concept_stick_thunder";
export const STARTER_PLAYBOOK_ID = stickThunderPlay.playbookId;
const SEED_TIME = 1_786_000_000_000;

const GUN_DOUBLES_LEFT = stockFormations.find(
  (formation) => formation.id === "formation_gun_doubles_left",
);
const GUN_TRIPS_RIGHT = stockFormations.find(
  (formation) => formation.id === "formation_gun_trips_right",
);

export const stickThunderConcept: Concept = {
  schemaVersion: 1,
  id: STICK_THUNDER_CONCEPT_ID,
  playbookId: STARTER_PLAYBOOK_ID,
  revision: 1,
  name: "Stick — Thunder",
  unit: "offense",
  notes:
    "Stick underneath, thunder outside — take the flat if the corner widens.",
  tags: ["3rd down", "red zone"],
};

function withConcept(play: PlayDocument, variantName?: string): PlayDocument {
  return attachPlayToConcept(play, stickThunderConcept, variantName);
}

function realign(
  play: PlayDocument,
  formation: (typeof stockFormations)[number],
  playId: string,
  variantName: string,
): PlayDocument {
  let nextId = 0;
  const aligned = applyFormation(play, formation, (prefix) => {
    nextId += 1;
    return `${prefix}_${playId}_${nextId}`;
  }).play;
  const { formationSource: _stock, ...withoutSource } = aligned;
  return createVariationPlay({
    source: withoutSource,
    concept: stickThunderConcept,
    variantName,
    playId,
  });
}

function redZonePlay(): PlayDocument {
  const withoutZRoutes = {
    ...stickThunderPlay,
    paths: stickThunderPlay.paths.filter((path) => path.playerId !== "z"),
    labels: stickThunderPlay.labels.filter(
      (label) => label.id !== "l10" && label.id !== "l11",
    ),
  };
  return createVariationPlay({
    source: withoutZRoutes,
    concept: stickThunderConcept,
    variantName: "Red zone",
    playId: "play_stick_thunder_red_zone",
  });
}

/**
 * The original's seeded family: one concept, four versions, one of them
 * diverged on purpose so a scoped change has something to report.
 */
export function stickThunderFamily(): readonly PlayDocument[] {
  if (!GUN_DOUBLES_LEFT || !GUN_TRIPS_RIGHT) {
    throw new Error("Stock Gun Doubles Left and Gun Trips Right are required.");
  }
  return [
    withConcept(stickThunderPlay),
    createVariationPlay({
      source: stickThunderPlay,
      concept: stickThunderConcept,
      variantName: "Gun Doubles Right",
      playId: "play_stick_thunder_gun_doubles_right",
    }),
    realign(
      stickThunderPlay,
      GUN_DOUBLES_LEFT,
      "play_stick_thunder_gun_doubles_left",
      "Gun Doubles Left",
    ),
    realign(
      stickThunderPlay,
      GUN_TRIPS_RIGHT,
      "play_stick_thunder_gun_trips_right",
      "Gun Trips Right",
    ),
    redZonePlay(),
  ];
}

function exampleFromTour(
  tourId: "quick" | "block" | "defense",
  playId: string,
  name: string,
): PlayDocument {
  const tour = demoTour(tourId);
  return copyPlayDocument(tour.play, { id: playId, name });
}

export function starterExamplePlays(): readonly PlayDocument[] {
  return [
    ...stickThunderFamily(),
    exampleFromTour("quick", "play_four_verticals", "Four Verticals"),
    exampleFromTour(
      "block",
      "play_outside_zone_pull",
      "Outside Zone — Pull",
    ),
    exampleFromTour(
      "defense",
      "play_cover_3_fire_zone",
      "Cover 3 — Fire Zone",
    ),
  ];
}

export function starterPlaybookEnvelope(): PlaybookEnvelope {
  const plays = starterExamplePlays();
  return {
    schemaVersion: 1,
    kind: "chalk-playbook",
    exportedAtMs: SEED_TIME,
    playbook: {
      schemaVersion: 1,
      id: STARTER_PLAYBOOK_ID,
      name: "Chalk Starter Playbook",
      defaultFieldProfileId: stickThunderPlay.fieldProfile.id,
      fieldProfiles: [stickThunderPlay.fieldProfile],
      playTypes: [...builtInPlayTypeDefinitions],
      createdAtMs: SEED_TIME,
      updatedAtMs: SEED_TIME,
    },
    concepts: [stickThunderConcept],
    formations: [],
    plays,
  };
}
