import type { PlaySearchProjection } from "@chalk/local-db";

import type { PlaybookSort } from "../app/editor-runtime";

const nameOrder = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/**
 * The order the Playbook reads in when nothing is being searched for. A
 * search keeps its own order, best match first.
 */
export function sortPlays(
  plays: readonly PlaySearchProjection[],
  sort: PlaybookSort,
): readonly PlaySearchProjection[] {
  return [...plays].sort(
    (left, right) =>
      (sort === "recent" ? right.updatedAtMs - left.updatedAtMs : 0) ||
      nameOrder.compare(left.name, right.name) ||
      left.playId.localeCompare(right.playId),
  );
}
