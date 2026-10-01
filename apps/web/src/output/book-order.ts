import type { Concept, PlayDocument, Playbook } from "@chalk/domain";
import { libraryOrder, type PlaybookOrder } from "@chalk/exports";
import type { PlaySearchProjection } from "@chalk/local-db";

import type { LibraryBrowserState } from "../app/editor-runtime";
import { sortPlays } from "../library/play-order";

/**
 * The order a Full playbook starts in. A book with an install order reads in
 * it (issue #166): that is the order its staff teaches the Plays in. Until
 * one is set, it reads the way the book's own page is sorted (issue #156),
 * so a Coach who sorted his book by name gets a contents page that runs the
 * same way. The page reads by name until he chooses otherwise, so an unset
 * sort is by name here too.
 */
export function bookDefaultOrder(
  state: Pick<LibraryBrowserState, "sort">,
  playbook: Pick<Playbook, "playOrder">,
): PlaybookOrder {
  if (playbook.playOrder && playbook.playOrder.length > 0) return "install";
  return state.sort === "recent" ? "recent" : "name";
}

/**
 * The book's Plays in the order asked for. Library order keeps a Concept's
 * Plays together, as every library output does. The page's sorts are the
 * page's own (`sortPlays`), read off the same projections the page sorts, so
 * the book prints exactly as the page lists it; a Play the page does not
 * list yet — the open one, not saved — comes last.
 */
export function bookPlaysInOrder(
  plays: readonly PlayDocument[],
  order: PlaybookOrder,
  members: readonly PlaySearchProjection[],
  concepts: readonly Concept[],
  /** The book's install order, for the install order's pages. */
  playOrder?: readonly string[],
): readonly PlayDocument[] {
  if (order === "library") {
    return libraryOrder(plays, concepts).map(({ play }) => play);
  }
  const byId = new Map(plays.map((play) => [play.id, play] as const));
  const listed = sortPlays(
    members.filter(({ playId }) => byId.has(playId)),
    order === "install" ? "order" : order,
    playOrder,
  ).map(({ playId }) => byId.get(playId)!);
  const seen = new Set(listed.map(({ id }) => id));
  return [...listed, ...plays.filter(({ id }) => !seen.has(id))];
}
