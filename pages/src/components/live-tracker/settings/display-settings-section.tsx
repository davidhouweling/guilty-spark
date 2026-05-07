import React from "react";
import classNames from "classnames";
import { Checkbox } from "../../checkbox/checkbox";
import {
  type DisplaySettings,
  INDIVIDUAL_TOP_BAR_STAT_OPTION_DEFINITIONS,
  INDIVIDUAL_TOP_BAR_SLOT_COUNT,
} from "./types";
import styles from "./display-settings-section.module.css";

const TOP_BAR_STAT_GROUP_LABELS = {
  summary: "Summary",
  "viewer-table": "Viewer Table Stats",
  compact: "Compact Stats",
} as const;

interface DisplaySettingsSectionProps {
  readonly settings: DisplaySettings;
  readonly onChange: (updates: Partial<DisplaySettings>) => void;
  readonly mode?: "series" | "individual";
}

export function DisplaySettingsSection({
  settings,
  onChange,
  mode = "series",
}: DisplaySettingsSectionProps): React.ReactElement {
  const isIndividualMode = mode === "individual";
  const defaultSlotValue = settings.topBarStatSlots[0] ?? INDIVIDUAL_TOP_BAR_STAT_OPTION_DEFINITIONS[0].value;
  const slotValues = Array.from({ length: INDIVIDUAL_TOP_BAR_SLOT_COUNT }, (_, index) => {
    return settings.topBarStatSlots[index] ?? defaultSlotValue;
  });

  const updateSlot = (slotIndex: number, value: string): void => {
    const nextValue =
      INDIVIDUAL_TOP_BAR_STAT_OPTION_DEFINITIONS.find((option) => option.value === value)?.value ??
      INDIVIDUAL_TOP_BAR_STAT_OPTION_DEFINITIONS[0].value;
    const nextSlots = [...slotValues];
    nextSlots[slotIndex] = nextValue;
    onChange({ topBarStatSlots: nextSlots });
  };

  return (
    <div className={classNames(styles.container, { [styles.containerIndividual]: isIndividualMode })}>
      {/* Team Details Section */}
      <div className={styles.section}>
        <h4 className={styles.subsectionHeader}>{isIndividualMode ? "In Series" : ""} Team Information</h4>

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
              label={`Show Discord Names${isIndividualMode ? " (if available)" : ""}`}
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
        <h4 className={styles.subsectionHeader}>{isIndividualMode ? "In Series" : ""} Queue Information</h4>
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
      </div>

      {isIndividualMode ? (
        <div className={classNames(styles.section, styles.sectionWide)}>
          <h4 className={styles.subsectionHeader}>Out of Series - Top Bar</h4>
          <p className={styles.sectionDescription}>
            These will also control the accumulated stats shown at the top of the Viewer page.
          </p>

          <div className={styles.optionsGrid}>
            {slotValues.map((slotValue, slotIndex) => (
              <label key={`top-bar-slot-${slotIndex.toString()}`} className={styles.dropdownField}>
                <span className={styles.dropdownLabel}>{`Top Stat ${(slotIndex + 1).toString()}`}</span>
                <select
                  className={styles.selectInput}
                  value={slotValue}
                  onChange={(event): void => {
                    updateSlot(slotIndex, event.target.value);
                  }}
                >
                  {(Object.keys(TOP_BAR_STAT_GROUP_LABELS) as (keyof typeof TOP_BAR_STAT_GROUP_LABELS)[]).map(
                    (group) => (
                      <optgroup key={group} label={TOP_BAR_STAT_GROUP_LABELS[group]}>
                        {INDIVIDUAL_TOP_BAR_STAT_OPTION_DEFINITIONS.filter((option) => option.group === group).map(
                          (option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ),
                        )}
                      </optgroup>
                    ),
                  )}
                </select>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
