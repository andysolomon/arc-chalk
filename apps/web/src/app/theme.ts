import { useCallback, useSyncExternalStore } from "react";

/**
 * Light or dark (ADR 0061), and the season that tints both (ADR 0082). The Coach picks one, or leaves it to the device.
 * The choice belongs to this device, not to a Playbook, so it lives in local
 * storage, where the inline script in index.html can read it before the
 * first paint. That script and this module share the key and the rule.
 */
export type ThemePreference = "system" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "chalk.theme";

const CHANGE_EVENT = "chalk-theme-change";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** The choice when this browser refuses storage: it holds until the page closes. */
let unsaved: ThemePreference = "system";

function parse(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function readThemePreference(): ThemePreference {
  try {
    return parse(globalThis.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return unsaved;
  }
}

function systemPrefersDark(): boolean {
  return globalThis.matchMedia?.(DARK_QUERY).matches ?? false;
}

export function resolveTheme(preference: ThemePreference): Theme {
  if (preference !== "system") return preference;
  return systemPrefersDark() ? "dark" : "light";
}

/**
 * A season the shell dresses for (ADR 0082). Only Thanksgiving week for now:
 * from the Monday before the fourth Thursday of November through the Sunday
 * after it, by the device's own calendar. The inline script in index.html
 * runs the same rule before the first paint, so keep the two in step.
 */
export type Season = "none" | "thanksgiving";

/**
 * Tests pin the season here so a run in late November paints like any other
 * day; a Coach's device never sets it.
 */
export const SEASON_SESSION_KEY = "chalk.season";

/** The fourth Thursday of November in `year`, as a day of the month. */
function thanksgivingDay(year: number): number {
  const firstWeekday = new Date(year, 10, 1).getDay();
  const firstThursday = 1 + ((4 - firstWeekday + 7) % 7);
  return firstThursday + 21;
}

export function seasonOn(date: Date): Season {
  if (date.getMonth() !== 10) return "none";
  const thursday = thanksgivingDay(date.getFullYear());
  const day = date.getDate();
  return day >= thursday - 3 && day <= thursday + 3 ? "thanksgiving" : "none";
}

/** The last day of the season in progress, for the Appearance note. */
export function seasonEnds(date: Date): Date {
  return new Date(
    date.getFullYear(),
    10,
    thanksgivingDay(date.getFullYear()) + 3,
  );
}

export function currentSeason(): Season {
  try {
    const pinned = globalThis.sessionStorage.getItem(SEASON_SESSION_KEY);
    if (pinned === "none" || pinned === "thanksgiving") return pinned;
  } catch {
    // No session storage: the calendar decides.
  }
  return seasonOn(new Date());
}

function applyTheme(): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(readThemePreference());
  const season = currentSeason();
  if (season === "none") delete root.dataset.season;
  else root.dataset.season = season;
}

/** How often an open Chalk looks at the calendar, so the week starts and ends on its own. */
const SEASON_CHECK_MS = 15 * 60 * 1000;

/** Saves the choice on this device and repaints every open view of it. */
export function saveThemePreference(preference: ThemePreference): void {
  unsaved = preference;
  try {
    if (preference === "system") {
      globalThis.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      globalThis.localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // Private browsing: `unsaved` carries the choice instead.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const media = globalThis.matchMedia?.(DARK_QUERY);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === THEME_STORAGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  media?.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    media?.removeEventListener("change", onChange);
  };
}

/**
 * Keeps the page's theme in step with the choice: a pick in Settings, a pick
 * in another tab, or the device turning dark at sunset while the choice is
 * "system". It also starts and ends a season as the calendar turns.
 */
export function followTheme(): () => void {
  applyTheme();
  const unsubscribe = subscribe(applyTheme);
  const onVisible = () => {
    if (document.visibilityState === "visible") applyTheme();
  };
  document.addEventListener("visibilitychange", onVisible);
  const timer = window.setInterval(applyTheme, SEASON_CHECK_MS);
  return () => {
    unsubscribe();
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(timer);
  };
}

/** The Appearance setting's value and its setter. */
export function useThemePreference(): readonly [
  ThemePreference,
  (preference: ThemePreference) => void,
] {
  const preference = useSyncExternalStore(
    subscribe,
    readThemePreference,
    () => "system" as const,
  );
  const choose = useCallback(
    (next: ThemePreference) => saveThemePreference(next),
    [],
  );
  return [preference, choose] as const;
}
