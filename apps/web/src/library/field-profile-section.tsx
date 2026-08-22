import {
  builtInFieldProfiles,
  createStableId,
  fieldProfileNeedsReapply,
  formationNeedsReapply,
  type FieldProfile,
  type Formation,
  type PlayDocument,
  type Playbook,
} from "@chalk/domain";

/**
 * Field Profile and Formation version management. Applying a profile copies
 * it onto the Play without rewriting yards (ADR 0032); a later revision of
 * the same profile, or of the Formation the Play was aligned from, reaches
 * the diagram only when the Coach asks.
 */
export function FieldProfileSection({
  formations,
  onApplyProfile,
  onCreateProfile,
  onReapplyFormation,
  play,
  playbook,
}: {
  formations: readonly Formation[];
  onApplyProfile: (profile: FieldProfile) => void;
  onCreateProfile: (profile: FieldProfile, asDefault: boolean) => void;
  onReapplyFormation: (formation: Formation) => void;
  play: PlayDocument;
  playbook: Playbook;
}) {
  const catalogue = mergeProfiles(playbook.fieldProfiles);
  const staleProfile = catalogue.find((profile) =>
    fieldProfileNeedsReapply(play, profile),
  );
  const sourceFormation = formations.find(
    (formation) => formation.id === play.formationSource?.formationId,
  );
  const staleFormation =
    sourceFormation && formationNeedsReapply(play, sourceFormation)
      ? sourceFormation
      : undefined;

  return (
    <section className="inspector-section">
      <div className="section-heading">Field</div>
      <div className="chip-row field-profile-chips">
        {catalogue.map((profile) => {
          const on = play.fieldProfile.id === profile.id;
          return (
            <button
              aria-pressed={on}
              className={`chip${on ? " active" : ""}`}
              key={profile.id}
              onClick={() => onApplyProfile(profile)}
              title="Change the markings — the Play's yards stay where they are"
              type="button"
            >
              {profile.name}
            </button>
          );
        })}
      </div>
      <p>
        High school, college and NFL hashes. Changing the profile never moves a
        man or a route.
      </p>
      {staleProfile ? (
        <div className="help-row">
          <button
            onClick={() => onApplyProfile(staleProfile)}
            title="The Playbook's Field Profile has moved on — put this Play on the new markings"
            type="button"
          >
            Reapply {staleProfile.name}
          </button>
        </div>
      ) : null}
      {staleFormation ? (
        <div className="help-row">
          <button
            onClick={() => onReapplyFormation(staleFormation)}
            title="This Formation has a newer revision — realign the men, keep their routes"
            type="button"
          >
            Reapply {staleFormation.name}
          </button>
        </div>
      ) : null}
      <NewProfileForm current={play.fieldProfile} onCreate={onCreateProfile} />
    </section>
  );
}

function NewProfileForm({
  current,
  onCreate,
}: {
  current: FieldProfile;
  onCreate: (profile: FieldProfile, asDefault: boolean) => void;
}) {
  return (
    <form
      className="field-profile-new"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const rawName = new FormData(form).get("name");
        const name = typeof rawName === "string" ? rawName.trim() : "";
        if (!name) return;
        const asDefault = Boolean(new FormData(form).get("default"));
        onCreate(
          {
            ...current,
            id: createStableId("field"),
            name,
            revision: 1,
          },
          asDefault,
        );
        form.reset();
      }}
    >
      <input
        aria-label="New field profile name"
        name="name"
        placeholder="Keep these markings as…"
        spellCheck={false}
      />
      <label>
        <input name="default" type="checkbox" />
        Playbook default
      </label>
      <button type="submit">Save profile</button>
    </form>
  );
}

function mergeProfiles(
  playbookProfiles: readonly FieldProfile[],
): readonly FieldProfile[] {
  const seen = new Set(playbookProfiles.map(({ id }) => id));
  return [
    ...playbookProfiles,
    ...builtInFieldProfiles.filter((profile) => !seen.has(profile.id)),
  ];
}
