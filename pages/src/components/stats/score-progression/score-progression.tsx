import React from "react";
import { DeltaChart } from "./delta-chart/delta-chart";
import { ProgressionChart } from "./progression-chart/progression-chart";
import type { ScoreProgressionViewModel } from "./types";
import styles from "./score-progression.module.css";

export function ScoreProgression({
  ariaLabel,
  effectiveChartType,
  hasDelta,
  deltaViewModel,
  progressionViewModel,
  onChartTypeChange,
}: ScoreProgressionViewModel): React.ReactElement {
  return (
    <div className={styles.container} role="img" aria-label={ariaLabel}>
      {hasDelta && (
        <div className={styles.toolbar}>
          <select
            className={styles.chartSelect}
            value={effectiveChartType}
            onChange={(e) => {
              onChartTypeChange(e.target.value);
            }}
            aria-label="Chart type"
          >
            <option value="progression">Score Progression</option>
            <option value="delta">Score Delta</option>
          </select>
        </div>
      )}
      {effectiveChartType === "delta" && deltaViewModel != null ? (
        <DeltaChart {...deltaViewModel} />
      ) : (
        <ProgressionChart {...progressionViewModel} />
      )}
    </div>
  );
}
