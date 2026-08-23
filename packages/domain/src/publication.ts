import {
  playDocumentSchema,
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
    ...(play.attachments === undefined || play.attachments.length === 0
      ? {}
      : { attachments: play.attachments }),
    ...(play.filmReferences === undefined || play.filmReferences.length === 0
      ? {}
      : { filmReferences: play.filmReferences }),
  });
}

/** Rehydrates a publication Play for rendering only — never for saving. */
export function playDocumentFromPublished(play: PublishedPlay): PlayDocument {
  return playDocumentSchema.parse({
    schemaVersion: 3,
    id: play.id,
    playbookId: "playbook_shared",
    name: play.name,
    unit: play.unit,
    ...(play.playType === undefined ? {} : { playType: play.playType }),
    ...(play.personnelLabel === undefined
      ? {}
      : { personnelLabel: play.personnelLabel }),
    tags: [],
    notes: "",
    fieldProfile: play.fieldProfile,
    players: play.players,
    assignments: [],
    paths: play.paths,
    labels: play.labels,
    ...(play.attachments === undefined
      ? {}
      : { attachments: play.attachments }),
    ...(play.filmReferences === undefined
      ? {}
      : { filmReferences: play.filmReferences }),
  });
}

export function publicationContainsAsset(
  publication: SharePublication,
  hash: string,
): boolean {
  return publication.entries.some((entry) =>
    (entry.play.attachments ?? []).some(
      (attachment) => attachment.hash === hash,
    ),
  );
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
