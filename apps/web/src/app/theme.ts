import { useCallback, useSyncExternalStore } from "react";

/**
 * Light or dark (ADR 0061). The Coach picks one, or leaves it to the device.
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

function applyTheme(): void {
  document.documentElement.dataset.theme = resolveTheme(readThemePreference());
}

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
 * "system".
 */
export function followTheme(): () => void {
  applyTheme();
  return subscribe(applyTheme);
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
