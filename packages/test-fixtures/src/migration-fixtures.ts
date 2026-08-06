import {
  playDocumentV1Schema,
  playDocumentV2Schema,
  playEnvelopeV1Schema,
  stickThunderPlay,
  type PlayDocumentV1,
  type PlayDocumentV2,
  type PlayEnvelopeV1,
} from "@chalk/domain";

const releasedPaths = stickThunderPlay.paths.map((path, index) => ({
  ...structuredClone(path),
  ...(index === 0 ? { assignment: "Push vertical, then win to the flat" } : {}),
}));

const releasedFields = {
  id: stickThunderPlay.id,
  name: stickThunderPlay.name,
  unit: stickThunderPlay.unit,
  playType: "Pass" as const,
  tags: [...stickThunderPlay.tags],
  notes: stickThunderPlay.notes,
  players: structuredClone(stickThunderPlay.players),
  paths: releasedPaths,
  labels: structuredClone(stickThunderPlay.labels),
};

export const releasedPlayDocumentV1: PlayDocumentV1 =
  playDocumentV1Schema.parse({
    schemaVersion: 1,
    ...releasedFields,
    fieldProfile: {
      id: "field_high_school",
      name: "High school",
      widthYards: 160 / 3,
      endZoneDepthYards: 10,
      hashOffsetYards: 53 + 4 / 12,
    },
  });

export const releasedPlayDocumentV2: PlayDocumentV2 =
  playDocumentV2Schema.parse({
    schemaVersion: 2,
    ...releasedFields,
    fieldProfile: structuredClone(stickThunderPlay.fieldProfile),
  });

export const releasedPlayEnvelopeV1: PlayEnvelopeV1 =
  playEnvelopeV1Schema.parse({
    schemaVersion: 1,
    kind: "chalk-play",
    exportedAtMs: 1_786_000_000_000,
    play: releasedPlayDocumentV2,
  });
