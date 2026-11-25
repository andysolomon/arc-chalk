import { useId, type ReactNode } from "react";

import { PRODUCT_NAME } from "@chalk/domain";
import type { EditorVersionSummary } from "@chalk/editor";
import {
  pageKindCatalog,
  typePresetCatalog,
  type PageKindId,
  type TypePresetId,
} from "@chalk/render";
import {
  currentSeason,
  seasonEnds,
  type FieldPreference,
  type ThemePreference,
} from "../app/theme";
import { agoStamp } from "./ago-stamp";
import {
  PageKindThumb,
  SettingsIcon,
  ThemeThumb,
  type SettingsGlyph,
} from "./settings-icons";

const themeChoices: readonly {
  readonly id: ThemePreference;
  readonly name: string;
}[] = [
  { id: "system", name: "System" },
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
];

const fieldChoices: readonly {
  readonly id: FieldPreference;
  readonly name: string;
}[] = [
  { id: "theme", name: "Match theme" },
  { id: "paper", name: "Paper" },
];

/**
 * Settings — Field, Print & export, History, Playbook, Appearance, Account
 * and About as the tabs of one dialog (ADR 0058, ADR 0061). A desktop shows
 * them down the left of a modal, split into what belongs to this play and
 * what holds everywhere; a phone shows them as pills across a full-screen
 * page. Each tab opens on a line that says what it changes, then its
 * settings as titled cards.
 */
export type SettingsTab =
  | "field"
  | "playbook"
  | "history"
  | "print"
  | "appearance"
  | "account"
  | "about";

interface TabSpec {
  readonly id: SettingsTab;
  readonly name: string;
  readonly icon: SettingsGlyph;
  /** What the tab changes, under its name at the head of the page. */
  readonly description: string;
}

const tabGroups: readonly {
  readonly name: string;
  readonly tabs: readonly TabSpec[];
}[] = [
  {
    name: "This play",
    tabs: [
      {
        id: "field",
        name: "Field",
        icon: "field",
        description: "The hash marks this play is drawn on.",
      },
      {
        id: "print",
        name: "Print & export",
        icon: "print",
        description:
          "What's drawn under this play and how big its words are, on screen and on paper.",
      },
      {
        id: "history",
        name: "History",
        icon: "history",
        description: "Named snapshots of this play you can go back to.",
      },
    ],
  },
  {
    name: "General",
    tabs: [
      {
        id: "playbook",
        name: "Playbook",
        icon: "playbook",
        description: "Defaults every play in this playbook shares.",
      },
      {
        id: "appearance",
        name: "Appearance",
        icon: "appearance",
        description: "How Chalk looks on this device.",
      },
      {
        id: "account",
        name: "Account",
        icon: "account",
        description: "Sign-in, sync and backups for your playbooks.",
      },
      {
        id: "about",
        name: "About",
        icon: "about",
        description: `What ${PRODUCT_NAME} is, and which version this is.`,
      },
    ],
  },
];

const allTabs = tabGroups.flatMap(({ tabs }) => tabs);

/**
 * One titled block of settings: a name, a line on what it does, then its
 * controls. Every tab is built from these, so they all read the same way.
 */
export function SettingsCard({
  children,
  hint,
  title,
}: {
  children?: ReactNode;
  hint?: ReactNode;
  title: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="settings-card">
      <div className="settings-card-head">
        <h3 className="settings-card-title" id={id}>
          {title}
        </h3>
        {hint ? <p className="settings-card-hint">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function SettingsOverlay({
  account,
  field,
  fieldProfile,
  onClose,
  onField,
  onPageKind,
  onRestoreVersion,
  onTab,
  onTheme,
  onTypePreset,
  pageKind,
  playbookSettings,
  tab,
  theme,
  typePreset,
  version,
  versions,
}: {
  /**
   * The Account panel and Backup, both moved here from the More menu (ADR
   * 0058, ADR 0074).
   */
  account?: React.ReactNode;
  /** Under a dark shell: a dark field, or the field kept on paper (ADR 0083). */
  field: FieldPreference;
  fieldProfile?: React.ReactNode;
  onClose: () => void;
  onField: (field: FieldPreference) => void;
  onPageKind: (kind: PageKindId) => void;
  onRestoreVersion: (revisionId: string) => void;
  onTab: (tab: SettingsTab) => void;
  onTheme: (theme: ThemePreference) => void;
  onTypePreset: (preset: TypePresetId) => void;
  pageKind: PageKindId;
  playbookSettings?: React.ReactNode;
  tab: SettingsTab;
  /** Light, dark, or whichever this device is set to. */
  theme: ThemePreference;
  typePreset: TypePresetId;
  /** The build's version, if the build named one. */
  version?: string;
  versions: readonly EditorVersionSummary[];
}) {
  const typeId = useId();

  const current = allTabs.find(({ id }) => id === tab) ?? allTabs[0]!;

  return (
    <div
      className="overlay settings-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        aria-label="Settings"
        className="settings-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="settings-side">
          <div className="settings-title">Settings</div>
          <div
            aria-label="Settings tabs"
            className="settings-tabs"
            role="tablist"
          >
            {tabGroups.map((group) => (
              <div className="settings-tab-group" key={group.name}>
                <div aria-hidden="true" className="settings-group-label">
                  {group.name}
                </div>
                {group.tabs.map((entry) => (
                  <button
                    aria-controls="settings-tab-body"
                    aria-label={entry.name}
                    aria-selected={entry.id === current.id}
                    className={`settings-tab${entry.id === current.id ? " active" : ""}`}
                    key={entry.id}
                    onClick={() => onTab(entry.id)}
                    role="tab"
                    type="button"
                  >
                    <span className="settings-tab-icon">
                      <SettingsIcon glyph={entry.icon} />
                    </span>
                    <span className="settings-tab-name">{entry.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="settings-main">
          <div className="settings-head">
            <span aria-hidden="true" className="settings-head-icon">
              <SettingsIcon glyph={current.icon} />
            </span>
            <div className="settings-head-text">
              <h2 className="settings-heading">{current.name}</h2>
              <p className="settings-summary">{current.description}</p>
            </div>
            <button
              aria-label="Close"
              autoFocus
              className="settings-close"
              onClick={onClose}
              title="Close (Esc)"
              type="button"
            >
              <SettingsIcon glyph="close" />
            </button>
          </div>
          <div
            aria-label={current.name}
            className="settings-body"
            id="settings-tab-body"
            role="tabpanel"
          >
            {current.id === "field" ? fieldProfile : null}
            {current.id === "playbook" ? playbookSettings : null}
            {current.id === "history" ? (
              versions.length > 0 ? (
                <SettingsCard
                  hint="Restoring puts that state back on the field — undo returns you to now."
                  title="Snapshots"
                >
                  <div className="history-list">
                    {versions.map((entry, index) => {
                      const label = entry.label ?? "Unnamed version";
                      return (
                        <div className="history-row" key={entry.id}>
                          <span className="history-text">
                            <span
                              className={
                                index === 0
                                  ? "history-label current"
                                  : "history-label"
                              }
                              title={label}
                            >
                              {label}
                            </span>
                            <span className="history-ago">
                              {agoStamp(entry.createdAtMs)}
                            </span>
                          </span>
                          <button
                            onClick={() => onRestoreVersion(entry.id)}
                            title="Put this state back on the field — undo returns to now"
                            type="button"
                          >
                            Restore
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </SettingsCard>
              ) : (
                <div className="settings-empty">
                  <span aria-hidden="true" className="settings-empty-icon">
                    <SettingsIcon glyph="history" />
                  </span>
                  <p className="settings-empty-title">No snapshots yet</p>
                  <p className="history-empty">
                    Take a Snapshot from Versions in the header when you want a
                    state of this play you can come back to. Snapshots are kept
                    even after you close the tab.
                  </p>
                </div>
              )
            ) : null}
            {current.id === "print" ? (
              <>
                <SettingsCard
                  hint="What's drawn under the play. The players and their lines never move."
                  title="Page"
                >
                  <div className="settings-page-kinds">
                    {pageKindCatalog.map((kind) => (
                      <button
                        aria-pressed={pageKind === kind.id}
                        className={`settings-tile${pageKind === kind.id ? " active" : ""}`}
                        key={kind.id}
                        onClick={() => onPageKind(kind.id)}
                        type="button"
                      >
                        <PageKindThumb kind={kind.id} />
                        <span className="settings-tile-name">{kind.name}</span>
                      </button>
                    ))}
                  </div>
                </SettingsCard>
                <SettingsCard
                  hint="How big the words on the field are, and which ones show."
                  title="Type"
                >
                  <div className="settings-options">
                    {typePresetCatalog.map((preset) => {
                      const on = typePreset === preset.id;
                      return (
                        <button
                          aria-describedby={`${typeId}-${preset.id}-hint`}
                          aria-labelledby={`${typeId}-${preset.id}-name`}
                          aria-pressed={on}
                          className={`settings-option${on ? " active" : ""}`}
                          key={preset.id}
                          onClick={() => onTypePreset(preset.id)}
                          type="button"
                        >
                          <span className="settings-option-text">
                            <span
                              className="settings-option-name"
                              id={`${typeId}-${preset.id}-name`}
                            >
                              {preset.name}
                            </span>
                            <span
                              className="settings-option-hint"
                              id={`${typeId}-${preset.id}-hint`}
                            >
                              {preset.hint}
                            </span>
                          </span>
                          <span aria-hidden="true" className="settings-check">
                            {on ? <SettingsIcon glyph="check" /> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </SettingsCard>
              </>
            ) : null}
            {current.id === "appearance" ? (
              <>
                {currentSeason() === "thanksgiving" ? (
                  <p className="settings-season">
                    Happy Thanksgiving. Autumn colors are on in light and dark
                    through{" "}
                    {seasonEnds(new Date()).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "long",
                      weekday: "long",
                    })}
                    .
                  </p>
                ) : null}
                <SettingsCard
                  hint="System follows this device's light or dark setting."
                  title="Theme"
                >
                  <div aria-label="Theme" className="theme-tiles" role="group">
                    {themeChoices.map((choice) => (
                      <button
                        aria-pressed={theme === choice.id}
                        className={`settings-tile${theme === choice.id ? " active" : ""}`}
                        key={choice.id}
                        onClick={() => onTheme(choice.id)}
                        type="button"
                      >
                        <ThemeThumb theme={choice.id} />
                        <span className="settings-tile-name">
                          <SettingsIcon glyph={choice.id} />
                          {choice.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </SettingsCard>
                <SettingsCard
                  hint="In dark, the field goes dark with the app unless you keep it on paper. Print preview and exports always stay on white paper."
                  title="Field"
                >
                  <div aria-label="Field" className="segments" role="group">
                    {fieldChoices.map((choice) => (
                      <button
                        aria-pressed={field === choice.id}
                        className={field === choice.id ? "active" : undefined}
                        key={choice.id}
                        onClick={() => onField(choice.id)}
                        type="button"
                      >
                        {choice.name}
                      </button>
                    ))}
                  </div>
                </SettingsCard>
              </>
            ) : null}
            {current.id === "account" ? account : null}
            {current.id === "about" ? (
              <div className="settings-card settings-about">
                <svg
                  aria-hidden="true"
                  className="settings-about-mark"
                  viewBox="0 0 32 32"
                >
                  <rect fill="var(--ink)" height="32" rx="8" width="32" />
                  <path d="M12 9.5 23 16l-11 6.5z" fill="var(--on-ink)" />
                </svg>
                <div className="settings-about-text">
                  <p className="settings-about-name">
                    {PRODUCT_NAME}
                    {version ? (
                      <span className="settings-badge">v{version}</span>
                    ) : null}
                  </p>
                  <p className="settings-card-hint">
                    A play-design and playbook editor for one coach. Your
                    playbooks are saved on this device; sign in under Account to
                    keep them in sync across devices.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
