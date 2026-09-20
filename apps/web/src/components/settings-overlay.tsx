import { useEffect, useRef } from "react";

import type { EditorVersionSummary } from "@chalk/editor";
import {
  pageKindCatalog,
  typePresetCatalog,
  type PageKindId,
  type TypePresetId,
} from "@chalk/render";
import { agoStamp } from "./ago-stamp";

/**
 * Settings — Field profile, Playbook settings, History and Print & export
 * moved out of the right inspector (issue: sidebar cleanup). The Coach opens
 * this from the More menu; what was previously a folded disclosure on every
 * rail lives here behind a single click.
 */
export function SettingsOverlay({
  fieldProfile,
  fieldProfileName,
  onClose,
  onPageKind,
  onRestoreVersion,
  onTypePreset,
  pageKind,
  playbookSettings,
  typeHint,
  typePreset,
  versions,
}: {
  fieldProfile?: React.ReactNode;
  fieldProfileName: string;
  onClose: () => void;
  onPageKind: (kind: PageKindId) => void;
  onRestoreVersion: (revisionId: string) => void;
  onTypePreset: (preset: TypePresetId) => void;
  pageKind: PageKindId;
  playbookSettings?: React.ReactNode;
  typeHint: string;
  typePreset: TypePresetId;
  versions: readonly EditorVersionSummary[];
}) {
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    close.current?.focus();
  }, []);

  const versionsCount = versions.length;

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
        <div className="settings-head">
          <div className="settings-title">Settings</div>
          <button
            className="settings-close"
            onClick={onClose}
            ref={close}
            type="button"
          >
            Close
          </button>
        </div>
        <div className="settings-body">
          <section className="settings-section">
            <div className="settings-section-heading">
              <h2>Field</h2>
              <span className="settings-summary">{fieldProfileName}</span>
            </div>
            {fieldProfile}
          </section>

          <section className="settings-section">
            <div className="settings-section-heading">
              <h2>Playbook settings</h2>
              <span className="settings-summary">
                Field profiles · play types
              </span>
            </div>
            {playbookSettings}
          </section>

          <section className="settings-section">
            <div className="settings-section-heading">
              <h2>History{versionsCount ? ` ${versionsCount}` : ""}</h2>
              <span className="settings-summary">
                {versionsCount
                  ? "Named snapshots of this play"
                  : "Nothing saved back yet"}
              </span>
            </div>
            {versionsCount > 0 ? (
              <div className="history-list">
                {versions.map((version, index) => {
                  const label = version.label ?? "Unnamed version";
                  return (
                    <div className="history-row" key={version.id}>
                      <span className="history-ago">
                        {agoStamp(version.createdAtMs)}
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
                        onClick={() => onRestoreVersion(version.id)}
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
                Nothing saved back yet. Name a Snapshot from Save when you want
                a state you can come back to.
              </p>
            )}
            <p>
              Named snapshots of this play, kept across a closed tab. Restoring
              is itself undoable.
            </p>
          </section>

          <section className="settings-section">
            <div className="settings-section-heading">
              <h2>Print &amp; export</h2>
              <span className="settings-summary">
                {pageKindCatalog.find(({ id }) => id === pageKind)?.name ??
                  pageKind}{" "}
                ·{" "}
                {typePresetCatalog.find(({ id }) => id === typePreset)?.name ??
                  typePreset}
              </span>
            </div>
            <div className="sub-heading">Page</div>
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
            <p>
              Changes what prints under the play — the players and lines never
              move.
            </p>
            <div className="sub-heading">Type</div>
            <div className="segments">
              {typePresetCatalog.map((preset) => (
                <button
                  aria-pressed={typePreset === preset.id}
                  className={typePreset === preset.id ? "active" : undefined}
                  key={preset.id}
                  onClick={() => onTypePreset(preset.id)}
                  title={preset.hint}
                  type="button"
                >
                  {preset.name}
                </button>
              ))}
            </div>
            <p>{typeHint}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
