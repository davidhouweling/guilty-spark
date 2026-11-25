import React from "react";
import { Checkbox } from "../../checkbox/checkbox";
import { Heading } from "../../heading/heading";
import type { DisplaySettings } from "./types";
import styles from "./display-settings-section.module.css";

interface DisplaySettingsSectionProps {
  readonly settings: DisplaySettings;
  readonly stableTeamSlotsAvailable?: boolean;
  readonly showDiscordNamesToggle?: boolean;
  readonly showXboxNamesToggle?: boolean;
  readonly showServerIconToggle?: boolean;
  readonly onChange: (updates: Partial<DisplaySettings>) => void;
}

export function DisplaySettingsSection({
  settings,
  stableTeamSlotsAvailable = true,
  showDiscordNamesToggle = true,
  showXboxNamesToggle = true,
  showServerIconToggle = true,
  onChange,
}: DisplaySettingsSectionProps): React.ReactElement {
  return (
    <div className={styles.container}>
      {/* Team Details Section */}
      {stableTeamSlotsAvailable ? (
        <div className={styles.section}>
          <Heading tagName="h5" styleAs="h6" spacing={1} className={styles.subsectionHeader}>
            Team Information
          </Heading>

          <Checkbox
            checked={settings.showTeamDetails}
            onChange={(checked): void => {
              onChange({
                showTeamDetails: checked,
                ...(showDiscordNamesToggle && { showDiscordNames: checked }),
                ...(showXboxNamesToggle && { showXboxNames: checked }),
              });
            }}
            label="Show Team Details"
            description="Display team names and player information"
          />

          {settings.showTeamDetails && (
            <div className={styles.nested}>
              {showDiscordNamesToggle ? (
                <Checkbox
                  checked={settings.showDiscordNames}
                  onChange={(checked): void => {
                    onChange({ showDiscordNames: checked });
                  }}
                  label="Show Discord Names"
                />
              ) : null}

              {showXboxNamesToggle ? (
                <Checkbox
                  checked={settings.showXboxNames}
                  onChange={(checked): void => {
                    onChange({ showXboxNames: checked });
                  }}
                  label="Show Xbox Names"
                />
              ) : null}

              {(!showDiscordNamesToggle || !settings.showDiscordNames) &&
                (!showXboxNamesToggle || !settings.showXboxNames) && (
                  <p className={styles.hint}>Only team names will be shown</p>
                )}
            </div>
          )}
        </div>
      ) : null}

      {/* Queue Info Section */}
      <div className={styles.section}>
        <Heading tagName="h5" styleAs="h6" spacing={1} className={styles.subsectionHeader}>
          Queue Information
        </Heading>
        <p className={styles.sectionDescription}>Control the parts shown in the top section</p>

        <Checkbox
          checked={settings.showTitle}
          onChange={(checked): void => {
            onChange({ showTitle: checked });
          }}
          label="Show Title / Server Name"
        />

        <Checkbox
          checked={settings.showSubtitle}
          onChange={(checked): void => {
            onChange({ showSubtitle: checked });
          }}
          label="Show Subtitle / Queue Number"
        />

        <Checkbox
          checked={settings.showScore}
          onChange={(checked): void => {
            onChange({ showScore: checked });
          }}
          label="Show Score"
        />

        {showServerIconToggle ? (
          <Checkbox
            checked={settings.showServerIcon}
            onChange={(checked): void => {
              onChange({ showServerIcon: checked });
            }}
            label="Show Server Icon"
          />
        ) : null}
      </div>
    </div>
  );
}
