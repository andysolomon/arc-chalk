import type { PlaybookSummary } from "@chalk/local-db";

/** How the shelf lists its books. */
export type ShelfSort = "recent" | "name";

const nameOrder = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/** The books in the order the shelf reads in: the last one edited first, or A–Z. */
export function sortShelf(
  books: readonly PlaybookSummary[],
  sort: ShelfSort,
): readonly PlaybookSummary[] {
  return [...books].sort(
    (left, right) =>
      (sort === "recent" ? right.updatedAtMs - left.updatedAtMs : 0) ||
      nameOrder.compare(left.name, right.name) ||
      left.id.localeCompare(right.id),
  );
}
