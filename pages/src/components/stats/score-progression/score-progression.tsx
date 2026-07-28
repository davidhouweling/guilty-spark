import React from "react";
import { Checkbox } from "../../checkbox/checkbox";
import { Select } from "../../select/select";
import { DeltaChart } from "./delta-chart/delta-chart";
import { KothChart } from "./koth-chart/koth-chart";
import { ProgressionChart } from "./progression-chart/progression-chart";
import type { ScoreProgressionViewModel } from "./types";
import styles from "./score-progression.module.css";

export function ScoreProgression({
  ariaLabel,
  effectiveChartType,
  hasDelta,
  hasPlayerAdvantage,
  showPlayerAdvantage,
  showToolbar,
  deltaViewModel,
  progressionViewModel,
  kothControlChart,
  onChartTypeChange,
  onPlayerAdvantageChange,
}: ScoreProgressionViewModel): React.ReactElement {
  return (
    <div className={styles.container}>
      {showToolbar && (
        <div className={styles.toolbar}>
          {hasDelta && (
            <>
              <label htmlFor="chart-type-select" className={styles.toolbarLabel}>
                Chart type
              </label>
              <Select
                id="chart-type-select"
                containerClassName={styles.toolbarSelect}
                value={effectiveChartType}
                onChange={(e) => {
                  onChartTypeChange(e.target.value);
                }}
              >
                <option value="progression">Score Progression</option>
                <option value="delta">Score Delta</option>
              </Select>
            </>
          )}
          {hasPlayerAdvantage && (
            <Checkbox
              checked={showPlayerAdvantage}
              onChange={onPlayerAdvantageChange}
              label="Player Advantage"
              className={styles.toolbarCheckbox}
            />
          )}
        </div>
      )}
      <div role="img" aria-label={ariaLabel}>
        {effectiveChartType === "delta" && deltaViewModel != null ? (
          <DeltaChart {...deltaViewModel} />
        ) : (
          <ProgressionChart {...progressionViewModel} />
        )}
      </div>
      {kothControlChart != null && <KothChart {...kothControlChart} />}
    </div>
  );
}
