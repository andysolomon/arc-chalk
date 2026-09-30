import { inInstallOrder } from "@chalk/domain";
import type { PlaySearchProjection } from "@chalk/local-db";

import type { PlaybookSort } from "../app/editor-runtime";

const nameOrder = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/**
 * The order the Playbook reads in when nothing is being searched for. A
 * search keeps its own order, best match first. The install order is the
 * one the Coach set by hand; a Play he has not placed yet follows, by name.
 */
export function sortPlays(
  plays: readonly PlaySearchProjection[],
  sort: PlaybookSort,
  playOrder?: readonly string[],
): readonly PlaySearchProjection[] {
  const sorted = [...plays].sort(
    (left, right) =>
      (sort === "recent" ? right.updatedAtMs - left.updatedAtMs : 0) ||
      nameOrder.compare(left.name, right.name) ||
      left.playId.localeCompare(right.playId),
  );
  return sort === "order" ? inInstallOrder(sorted, playOrder) : sorted;
}
