import {
  createStableId,
  type PlayCommand,
  type PlayDocument,
} from "@chalk/domain";

export type CreateId = (prefix: string) => string;

/**
 * An edit built from the Play it is handed, giving any entity it makes an
 * id from `createId`. Undefined is nothing to do.
 */
export type BuildEdit = (
  document: PlayDocument,
  createId: CreateId,
) => PlayCommand | undefined;

export interface RepeatableIds {
  /** Makes new ids, and keeps them. */
  readonly create: CreateId;
  /**
   * Hands back the ids `create` made, prefix by prefix, in the order they
   * were made, then makes new ones past them.
   */
  readonly again: () => CreateId;
}

/**
 * Ids for an edit built twice: once against the Play on screen, for what
 * the shell shows at once, and again when its turn in the save queue runs.
 * Both builds name the same new entities, so a selection made at once
 * points at what lands.
 */
export function repeatableIds(make: CreateId = createStableId): RepeatableIds {
  const made = new Map<string, string[]>();
  return {
    create(prefix) {
      const id = make(prefix);
      made.set(prefix, [...(made.get(prefix) ?? []), id]);
      return id;
    },
    again() {
      const used = new Map<string, number>();
      return (prefix) => {
        const index = used.get(prefix) ?? 0;
        used.set(prefix, index + 1);
        return made.get(prefix)?.[index] ?? make(prefix);
      };
    },
  };
}
