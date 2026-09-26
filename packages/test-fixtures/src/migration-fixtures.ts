import {
  playDocumentV1Schema,
  playDocumentV2Schema,
  stickThunderPlay,
  type PlayDocumentV1,
  type PlayDocumentV2,
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
