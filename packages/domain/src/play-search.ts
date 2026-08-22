import type { PlayUnit } from "./schema";

/**
 * Compact, rebuildable Play search records. Geometry, revision history, and
 * image bytes stay out of the index (ADR 0036).
 */
export interface SearchablePlay {
  readonly playId: string;
  readonly playbookId: string;
  readonly name: string;
  readonly unit: PlayUnit;
  readonly playTypeId?: string;
  readonly playTypeName?: string;
  readonly conceptId?: string;
  readonly formationId?: string;
  readonly personnelLabel?: string;
  readonly tags: readonly string[];
  readonly playerRoles: readonly string[];
  readonly assignmentText: readonly string[];
  readonly notes: string;
}

export interface PlaySearchFilters {
  readonly playbookId?: string;
  readonly unit?: PlayUnit;
  readonly playTypeId?: string;
  readonly conceptId?: string;
  readonly formationId?: string;
  readonly personnelLabel?: string;
  readonly tags?: readonly string[];
}

export interface PlaySearchQuery {
  readonly text?: string;
  readonly filters?: PlaySearchFilters;
  readonly limit?: number;
}

export interface PlaySearchHit {
  readonly playId: string;
  readonly score: number;
}

const TOKEN = /[a-z0-9]+/g;
const FUZZY_MIN_LENGTH = 4;

export function tokenizeSearchText(value: string): readonly string[] {
  return (value.toLowerCase().match(TOKEN) ?? []).filter(Boolean);
}

export function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 0; i < left.length; i += 1) {
    const current = [i + 1];
    for (let j = 0; j < right.length; j += 1) {
      const insert = (current[j] ?? 0) + 1;
      const remove = (previous[j + 1] ?? 0) + 1;
      const replace =
        (previous[j] ?? 0) + (left[i] === right[j] ? 0 : 1);
      current.push(Math.min(insert, remove, replace));
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? right.length;
}

function haystackOf(play: SearchablePlay): readonly string[] {
  return [
    play.name,
    play.unit,
    play.playTypeName ?? "",
    play.personnelLabel ?? "",
    play.notes,
    ...play.tags,
    ...play.playerRoles,
    ...play.assignmentText,
  ];
}

function tokensOf(play: SearchablePlay): readonly string[] {
  return haystackOf(play).flatMap((value) => tokenizeSearchText(value));
}

function tokenMatches(query: string, candidate: string): boolean {
  if (candidate === query) return true;
  if (candidate.startsWith(query)) return true;
  return (
    query.length >= FUZZY_MIN_LENGTH &&
    candidate.length >= FUZZY_MIN_LENGTH &&
    levenshtein(query, candidate) <= 1
  );
}

function matchesFilters(
  play: SearchablePlay,
  filters: PlaySearchFilters | undefined,
): boolean {
  if (!filters) return true;
  if (filters.playbookId && play.playbookId !== filters.playbookId) {
    return false;
  }
  if (filters.unit && play.unit !== filters.unit) return false;
  if (filters.playTypeId && play.playTypeId !== filters.playTypeId) {
    return false;
  }
  if (filters.conceptId && play.conceptId !== filters.conceptId) return false;
  if (filters.formationId && play.formationId !== filters.formationId) {
    return false;
  }
  if (
    filters.personnelLabel &&
    play.personnelLabel !== filters.personnelLabel
  ) {
    return false;
  }
  if (filters.tags?.length) {
    const tags = new Set(play.tags);
    for (const tag of filters.tags) {
      if (!tags.has(tag)) return false;
    }
  }
  return true;
}

function scorePlay(play: SearchablePlay, queryTokens: readonly string[]): number {
  if (queryTokens.length === 0) return 1;
  const nameTokens = tokenizeSearchText(play.name);
  const allTokens = tokensOf(play);
  let score = 0;
  for (const token of queryTokens) {
    if (nameTokens.some((candidate) => candidate === token)) score += 8;
    else if (nameTokens.some((candidate) => candidate.startsWith(token))) {
      score += 5;
    } else if (allTokens.some((candidate) => tokenMatches(token, candidate))) {
      score += 2;
    } else {
      return 0;
    }
  }
  return score;
}

/**
 * Structured filters plus token, prefix, and bounded fuzzy matching. The
 * 2,000-Play budget is a 50 ms result target (ADR 0036); this path is pure
 * so a Worker can run it without loading Play revisions.
 */
export function searchPlays(
  plays: readonly SearchablePlay[],
  query: PlaySearchQuery = {},
): readonly PlaySearchHit[] {
  const queryTokens = tokenizeSearchText(query.text ?? "");
  const limit = query.limit ?? plays.length;
  const hits: PlaySearchHit[] = [];
  for (const play of plays) {
    if (!matchesFilters(play, query.filters)) continue;
    const score = scorePlay(play, queryTokens);
    if (score <= 0) continue;
    hits.push({ playId: play.playId, score });
  }
  return hits
    .sort(
      (left, right) =>
        right.score - left.score || left.playId.localeCompare(right.playId),
    )
    .slice(0, Math.max(0, limit));
}
