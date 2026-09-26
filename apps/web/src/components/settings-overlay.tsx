import { useEffect, useRef } from "react";

import { PRODUCT_NAME } from "@chalk/domain";
import type { EditorVersionSummary } from "@chalk/editor";
import {
  pageKindCatalog,
  typePresetCatalog,
  type PageKindId,
  type TypePresetId,
} from "@chalk/render";
import type { ThemePreference } from "../app/theme";
import { agoStamp } from "./ago-stamp";

const themeChoices: readonly {
  readonly id: ThemePreference;
  readonly name: string;
}[] = [
  { id: "system", name: "System" },
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
];

/**
 * Settings — Field, Playbook, History, Print & export, Appearance, Account
 * and About as the tabs of one dialog (ADR 0058, ADR 0061). A desktop shows them down the left of a
 * modal; a phone shows them as pills across a full-screen page. Each tab's
 * contents are the sections that used to stack in one scrolling list, with
 * the same words and the same behaviour.
 */
export type SettingsTab =
  | "field"
  | "playbook"
  | "history"
  | "print"
  | "appearance"
  | "account"
  | "about";

export function SettingsOverlay({
  account,
  accountSummary,
  fieldProfile,
  fieldProfileName,
  onClose,
  onPageKind,
  onRestoreVersion,
  onTab,
  onTheme,
  onTypePreset,
  pageKind,
  playbookSettings,
  tab,
  theme,
  typeHint,
  typePreset,
  version,
  versions,
}: {
  /** The Account panel, moved here from the More menu. */
  account?: React.ReactNode;
  /** One line about the account: "Local only", "Signed in". */
  accountSummary: string;
  fieldProfile?: React.ReactNode;
  fieldProfileName: string;
  onClose: () => void;
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
  typeHint: string;
  typePreset: TypePresetId;
  /** The build's version, if the build named one. */
  version?: string;
  versions: readonly EditorVersionSummary[];
}) {
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    close.current?.focus();
  }, []);

  const versionsCount = versions.length;
  const pageName =
    pageKindCatalog.find(({ id }) => id === pageKind)?.name ?? pageKind;
  const typeName =
    typePresetCatalog.find(({ id }) => id === typePreset)?.name ?? typePreset;
  const themeName =
    themeChoices.find(({ id }) => id === theme)?.name ?? "System";
  const tabs: readonly {
    readonly id: SettingsTab;
    readonly name: string;
    readonly value: string;
    readonly summary: string;
  }[] = [
    {
      id: "field",
      name: "Field",
      value: fieldProfileName,
      summary: fieldProfileName,
    },
    {
      id: "playbook",
      name: "Playbook",
      value: "Types · labels",
      summary: "Field profiles · play types · coverage",
    },
    {
      id: "history",
      name: "History",
      value: versionsCount ? String(versionsCount) : "",
      summary: versionsCount
        ? "Named snapshots of this play"
        : "Nothing saved back yet",
    },
    {
      id: "print",
      name: "Print & export",
      value: `${pageName} · ${typeName}`,
      summary: `${pageName} · ${typeName}`,
    },
    {
      id: "appearance",
      name: "Appearance",
      value: themeName,
      summary:
        theme === "system" ? "Follows this device" : `${themeName} theme`,
    },
    {
      id: "account",
      name: "Account",
      value: accountSummary,
      summary: accountSummary,
    },
    {
      id: "about",
      name: "About",
      value: version ? `v${version}` : "",
      summary: version ? `${PRODUCT_NAME} v${version}` : PRODUCT_NAME,
    },
  ];
  const current = tabs.find(({ id }) => id === tab) ?? tabs[0]!;

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
            {tabs.map((entry) => (
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
                <span className="settings-tab-name">{entry.name}</span>
                {entry.value ? (
                  <span className="settings-tab-value">{entry.value}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-main">
          <div className="settings-head">
            <h2 className="settings-heading">
              {current.name}
              <span className="settings-summary">{current.summary}</span>
            </h2>
            <button
              className="settings-close"
              onClick={onClose}
              ref={close}
              type="button"
            >
              Close
            </button>
          </div>
          <div
            aria-label={current.name}
            className="settings-body"
            id="settings-tab-body"
            role="tabpanel"
          >
            {current.id === "field" ? (
              <section className="settings-section">{fieldProfile}</section>
            ) : null}
            {current.id === "playbook" ? (
              <section className="settings-section">{playbookSettings}</section>
            ) : null}
            {current.id === "history" ? (
              <section className="settings-section">
                {versionsCount > 0 ? (
                  <div className="history-list">
                    {versions.map((entry, index) => {
                      const label = entry.label ?? "Unnamed version";
                      return (
                        <div className="history-row" key={entry.id}>
                          <span className="history-ago">
                            {agoStamp(entry.createdAtMs)}
                          </span>
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
                ) : (
                  <p className="history-empty">
                    Nothing saved back yet. Name a Snapshot from Save when you
                    want a state you can come back to.
                  </p>
                )}
                <p>
                  Named snapshots of this play, kept across a closed tab.
                  Restoring is itself undoable.
                </p>
              </section>
            ) : null}
            {current.id === "print" ? (
              <section className="settings-section">
                <div className="settings-field">
                  <span className="settings-field-label">Page</span>
                  <div className="page-kinds">
                    {pageKindCatalog.map((kind) => (
                      <button
                        aria-pressed={pageKind === kind.id}
                        className={pageKind === kind.id ? "active" : undefined}
                        key={kind.id}
                        onClick={() => onPageKind(kind.id)}
                        type="button"
                      >
                        {kind.name}
                      </button>
                    ))}
                  </div>
                </div>
                <p>
                  Changes what prints under the play — the players and lines
                  never move.
                </p>
                <div className="settings-field">
                  <span className="settings-field-label">Type</span>
                  <div className="segments">
                    {typePresetCatalog.map((preset) => (
                      <button
                        aria-pressed={typePreset === preset.id}
                        className={
                          typePreset === preset.id ? "active" : undefined
                        }
                        key={preset.id}
                        onClick={() => onTypePreset(preset.id)}
                        title={preset.hint}
                        type="button"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
                <p>{typeHint}</p>
              </section>
            ) : null}
            {current.id === "appearance" ? (
              <section className="settings-section">
                <div className="settings-field">
                  <span className="settings-field-label">Theme</span>
                  <div aria-label="Theme" className="segments" role="group">
                    {themeChoices.map((choice) => (
                      <button
                        aria-pressed={theme === choice.id}
                        className={theme === choice.id ? "active" : undefined}
                        key={choice.id}
                        onClick={() => onTheme(choice.id)}
                        type="button"
                      >
                        {choice.name}
                      </button>
                    ))}
                  </div>
                </div>
                <p>
                  System follows this device&rsquo;s light or dark setting. The
                  field and the print preview stay on white paper, the way they
                  print.
                </p>
              </section>
            ) : null}
            {current.id === "account" ? (
              <section className="settings-section settings-account">
                {account}
              </section>
            ) : null}
            {current.id === "about" ? (
              <section className="settings-section">
                <p className="settings-about-name">
                  {PRODUCT_NAME}
                  {version ? ` v${version}` : ""}
                </p>
                <p>
                  A play-design and playbook editor for one coach. Your
                  playbooks are saved on this device; sign in under Account to
                  keep them in sync across devices.
                </p>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
