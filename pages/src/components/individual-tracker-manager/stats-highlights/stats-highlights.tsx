import React from "react";
import { INDIVIDUAL_STATS_HIGHLIGHTS_MAX_SLOT_COUNT } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { Alert } from "../../alert/alert";
import { Checkbox } from "../../checkbox/checkbox";
import { Heading } from "../../heading/heading";
import { Select } from "../../select/select";
import type { StatsHighlightsSectionViewModel } from "./types";
import styles from "./stats-highlights.module.css";

interface StatsHighlightsSectionViewProps extends StatsHighlightsSectionViewModel {
  readonly onEnabledChange: (checked: boolean) => void;
  readonly onSlotCountChange: (slotCount: number) => void;
  readonly onSlotValueChange: (index: number, value: string) => void;
}

export function StatsHighlightsSectionView({
  isEnabled,
  slotCount,
  configuredSlots,
  optionGroups,
  saveStatus,
  saveErrorMessage,
  showSaveToast,
  onEnabledChange,
  onSlotCountChange,
  onSlotValueChange,
}: StatsHighlightsSectionViewProps): React.ReactElement {
  return (
    <div className={styles.panel}>
      <Heading tagName="h2">Stats Highlights</Heading>
      <p className={styles.sectionDescription}>
        Control the stats highlights row shown in the tracker view. Choose whether it is visible, how many highlight
        slots are shown, and which metric appears in each slot.
      </p>

      <div className={styles.card}>
        <Checkbox
          checked={isEnabled}
          onChange={onEnabledChange}
          label="Show stats highlights"
          description="When enabled, the viewer and overlay render a stats highlights row of selected metrics."
        />

        <div className={styles.field}>
          <label htmlFor="stats-highlights-count" className={styles.fieldLabel}>
            Highlight count
          </label>
          <Select
            id="stats-highlights-count"
            value={slotCount.toString()}
            disabled={!isEnabled}
            onChange={(event): void => {
              onSlotCountChange(Number(event.target.value));
            }}
          >
            {Array.from({ length: INDIVIDUAL_STATS_HIGHLIGHTS_MAX_SLOT_COUNT }, (_, index) => index + 1).map(
              (count) => (
                <option key={count} value={count.toString()}>
                  {count.toString()}
                </option>
              ),
            )}
          </Select>
        </div>
      </div>

      {isEnabled ? (
        <div className={styles.card}>
          <Heading tagName="h3">Selected Highlights</Heading>
          <p className={styles.cardDescription}>
            Each slot keeps its own label in the stats highlights row and updates live from the durable object.
          </p>

          <div className={styles.slotGrid}>
            {configuredSlots.map((option, index) => (
              <div key={`highlight-slot-${index.toString()}`} className={styles.field}>
                <label htmlFor={`stats-highlight-slot-${index.toString()}`} className={styles.fieldLabel}>
                  {`Highlight ${(index + 1).toString()}`}
                </label>
                <Select
                  id={`stats-highlight-slot-${index.toString()}`}
                  value={option}
                  onChange={(event): void => {
                    onSlotValueChange(index, event.target.value);
                  }}
                >
                  {optionGroups.map(({ group, label, options }) => (
                    <optgroup key={group} label={label}>
                      {options.map((definition) => (
                        <option key={definition.value} value={definition.value}>
                          {definition.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Alert variant="info">
          Stats highlights are currently hidden. Turn them on to configure up to eight slots.
        </Alert>
      )}

      {showSaveToast ? (
        <div className={styles.floatingSaveToast} role="status" aria-live="polite">
          {saveStatus === "saving" ? (
            <Alert variant="info">Saving stats highlights...</Alert>
          ) : saveStatus === "error" ? (
            <Alert variant="error">{saveErrorMessage ?? "Failed to save stats highlights"}</Alert>
          ) : (
            <Alert variant="info">Stats highlights saved.</Alert>
          )}
        </div>
      ) : null}
    </div>
  );
}
