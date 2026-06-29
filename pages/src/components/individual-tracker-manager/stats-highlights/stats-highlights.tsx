import React, { useEffect, useRef, useState } from "react";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import {
  DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS,
  INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT,
  INDIVIDUAL_STATS_HIGHLIGHTS_MAX_SLOT_COUNT,
  INDIVIDUAL_STATS_HIGHLIGHTS_STAT_OPTION_DEFINITIONS,
  type IndividualStatsHighlightOptionGroup,
  type IndividualStatsHighlightOption,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { Alert } from "../../alert/alert";
import { Checkbox } from "../../checkbox/checkbox";
import { Select } from "../../select/select";
import type { SaveStatus } from "../streamer-connections/streamer-connections-store";
import styles from "./stats-highlights.module.css";

const STATS_HIGHLIGHTS_GROUP_LABELS: Record<IndividualStatsHighlightOptionGroup, string> = {
  individual: "Individual stats",
  compact: "Compacted stats",
  profile: "Profile stats",
};

const statsHighlightOptionGroups = (
  Object.keys(STATS_HIGHLIGHTS_GROUP_LABELS) as IndividualStatsHighlightOptionGroup[]
).map((group) => ({
  group,
  label: STATS_HIGHLIGHTS_GROUP_LABELS[group],
  options: INDIVIDUAL_STATS_HIGHLIGHTS_STAT_OPTION_DEFINITIONS.filter((definition) => definition.group === group),
}));

function buildStatsHighlightSlots(
  targetCount: number,
  currentSlots: readonly IndividualStatsHighlightOption[],
): readonly IndividualStatsHighlightOption[] {
  const nextSlots = [...currentSlots].slice(0, targetCount);

  for (const option of DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS) {
    if (nextSlots.length >= targetCount) {
      return nextSlots;
    }
    if (!nextSlots.includes(option)) {
      nextSlots.push(option);
    }
  }

  for (const definition of INDIVIDUAL_STATS_HIGHLIGHTS_STAT_OPTION_DEFINITIONS) {
    if (nextSlots.length >= targetCount) {
      return nextSlots;
    }
    if (!nextSlots.includes(definition.value)) {
      nextSlots.push(definition.value);
    }
  }

  return nextSlots;
}

function parseIndividualStatsHighlightOption(value: string): IndividualStatsHighlightOption {
  const definition = INDIVIDUAL_STATS_HIGHLIGHTS_STAT_OPTION_DEFINITIONS.find((candidate) => candidate.value === value);
  return Preconditions.checkExists(definition, "stats highlights option").value;
}

interface StatsHighlightsSectionViewProps {
  readonly statsHighlightSlots: readonly IndividualStatsHighlightOption[];
  readonly saveStatus: SaveStatus;
  readonly saveErrorMessage: string | null;
  readonly onStatsHighlightSlotsChange: (statsHighlightSlots: readonly IndividualStatsHighlightOption[]) => void;
}

export function StatsHighlightsSectionView({
  statsHighlightSlots,
  saveStatus,
  saveErrorMessage,
  onStatsHighlightSlotsChange,
}: StatsHighlightsSectionViewProps): React.ReactElement {
  const [showSaveToast, setShowSaveToast] = useState(false);
  const previousSaveStatusRef = useRef<SaveStatus>("idle");
  const isEnabled = statsHighlightSlots.length > 0;
  const slotCount = isEnabled ? statsHighlightSlots.length : INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT;
  const configuredSlots = buildStatsHighlightSlots(slotCount, statsHighlightSlots);

  useEffect(() => {
    const previousSaveStatus = previousSaveStatusRef.current;
    previousSaveStatusRef.current = saveStatus;

    if (saveStatus === "saving" || saveStatus === "error") {
      setShowSaveToast(true);
      return;
    }

    if (previousSaveStatus === "saving" && saveStatus === "saved") {
      setShowSaveToast(true);
    }
  }, [saveStatus]);

  useEffect(() => {
    if (!showSaveToast || saveStatus === "saving") {
      return;
    }

    const timeout = setTimeout(() => {
      setShowSaveToast(false);
    }, 2200);

    return (): void => {
      clearTimeout(timeout);
    };
  }, [showSaveToast, saveStatus]);

  return (
    <div className={styles.panel}>
      <h2 className={styles.sectionTitle}>Stats Highlights</h2>
      <p className={styles.sectionDescription}>
        Control the stats highlights row shown in the tracker view. Choose whether it is visible, how many highlight
        slots are shown, and which metric appears in each slot.
      </p>

      <div className={styles.card}>
        <Checkbox
          checked={isEnabled}
          onChange={(checked): void => {
            onStatsHighlightSlotsChange(
              checked ? buildStatsHighlightSlots(INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT, configuredSlots) : [],
            );
          }}
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
              onStatsHighlightSlotsChange(buildStatsHighlightSlots(Number(event.target.value), configuredSlots));
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
          <h3 className={styles.cardTitle}>Selected Highlights</h3>
          <p className={styles.cardDescription}>
            Each slot keeps its own label in the stats highlights row and updates live from the durable object.
          </p>

          <div className={styles.slotGrid}>
            {configuredSlots.map((option, index) => (
              <div key={`${index.toString()}-${option}`} className={styles.field}>
                <label htmlFor={`stats-highlight-slot-${index.toString()}`} className={styles.fieldLabel}>
                  {`Highlight ${(index + 1).toString()}`}
                </label>
                <Select
                  id={`stats-highlight-slot-${index.toString()}`}
                  value={option}
                  onChange={(event): void => {
                    const nextSlots = [...configuredSlots];
                    nextSlots[index] = parseIndividualStatsHighlightOption(event.target.value);
                    onStatsHighlightSlotsChange(nextSlots);
                  }}
                >
                  {statsHighlightOptionGroups.map(({ group, label, options }) => (
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
