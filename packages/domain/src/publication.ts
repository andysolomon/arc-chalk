import {
  publishedPlaySchema,
  sharePublicationSchema,
  type PlayDocument,
  type PublishedPlay,
  type SharePublication,
} from "./schema";

export interface SharePublicationDraft {
  readonly id: string;
  readonly title: string;
  readonly publishedAtMs: number;
  readonly entries: readonly {
    readonly id: string;
    readonly playRevisionId: string;
    readonly play: PlayDocument;
  }[];
  readonly presentation: SharePublication["presentation"];
}

export function projectPublishedPlay(play: PlayDocument): PublishedPlay {
  return publishedPlaySchema.parse({
    schemaVersion: 1,
    id: play.id,
    name: play.name,
    unit: play.unit,
    ...(play.playType === undefined ? {} : { playType: play.playType }),
    ...(play.personnelLabel === undefined
      ? {}
      : { personnelLabel: play.personnelLabel }),
    fieldProfile: play.fieldProfile,
    players: play.players,
    paths: play.paths,
    labels: play.labels,
  });
}

export function createSharePublication(
  draft: SharePublicationDraft,
): SharePublication {
  return sharePublicationSchema.parse({
    schemaVersion: 1,
    id: draft.id,
    title: draft.title,
    publishedAtMs: draft.publishedAtMs,
    entries: draft.entries.map((entry) => ({
      id: entry.id,
      playRevisionId: entry.playRevisionId,
      play: projectPublishedPlay(entry.play),
    })),
    presentation: draft.presentation,
  });
}
