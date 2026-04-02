import React from "react";
import { Checkbox } from "../../checkbox/checkbox";
import type { DisplaySettings } from "./types";
import styles from "./display-settings-section.module.css";

interface DisplaySettingsSectionProps {
  readonly settings: DisplaySettings;
  readonly onChange: (updates: Partial<DisplaySettings>) => void;
}

export function DisplaySettingsSection({ settings, onChange }: DisplaySettingsSectionProps): React.ReactElement {
  return (
    <div className={styles.container}>
      {/* Team Details Section */}
      <div className={styles.section}>
        <h4 className={styles.subsectionHeader}>Team Information</h4>

        <Checkbox
          checked={settings.showTeamDetails}
          onChange={(checked): void => {
            // Special handling for team details toggle
            if (!checked) {
              // When turning off team details, disable nested options
              onChange({
                showTeamDetails: false,
                showDiscordNames: false,
                showXboxNames: false,
              });
            } else {
              // When turning on team details, restore defaults
              onChange({
                showTeamDetails: true,
                showDiscordNames: true,
                showXboxNames: true,
              });
            }
          }}
          label="Show Team Details"
          description="Display team names and player information"
        />

        {settings.showTeamDetails && (
          <div className={styles.nested}>
            <Checkbox
              checked={settings.showDiscordNames}
              onChange={(checked): void => {
                onChange({ showDiscordNames: checked });
              }}
              label="Show Discord Names"
            />

            <Checkbox
              checked={settings.showXboxNames}
              onChange={(checked): void => {
                onChange({ showXboxNames: checked });
              }}
              label="Show Xbox Names"
            />

            {!settings.showDiscordNames && !settings.showXboxNames && (
              <p className={styles.hint}>Only team names will be shown</p>
            )}
          </div>
        )}
      </div>

      {/* Queue Info Section */}
      <div className={styles.section}>
        <h4 className={styles.subsectionHeader}>Queue Information</h4>
        <p className={styles.sectionDescription}>Control the parts shown in the top section</p>

        <Checkbox
          checked={settings.showTitle}
          onChange={(checked): void => {
            onChange({ showTitle: checked });
          }}
          label="Show First Line / Server Name"
        />

        <Checkbox
          checked={settings.showSubtitle}
          onChange={(checked): void => {
            onChange({ showSubtitle: checked });
          }}
          label="Show Second Line / Queue Number"
        />

        <Checkbox
          checked={settings.showScore}
          onChange={(checked): void => {
            onChange({ showScore: checked });
          }}
          label="Show Score"
        />
      </div>
    </div>
  );
}
