import React from "react";
import type { ScoreDeltaData, ScoreProgressionTeamLine } from "./types";
import { DeltaChart } from "./delta-chart/delta-chart";
import { ProgressionChart } from "./progression-chart/progression-chart";
import styles from "./score-progression.module.css";

interface ScoreProgressionProps {
  readonly durationMs: number;
  readonly teamLines: readonly ScoreProgressionTeamLine[];
  readonly scoreDelta: ScoreDeltaData | null;
  readonly ariaLabel: string;
}

type ChartType = "progression" | "delta";

export function ScoreProgression({
  durationMs,
  teamLines,
  scoreDelta,
  ariaLabel,
}: ScoreProgressionProps): React.ReactElement {
  const [chartType, setChartType] = React.useState<ChartType>("progression");

  const effectiveChartType: ChartType = chartType === "delta" && scoreDelta == null ? "progression" : chartType;

  return (
    <div className={styles.container} role="img" aria-label={ariaLabel}>
      <div className={styles.toolbar}>
        <select
          className={styles.chartSelect}
          value={effectiveChartType}
          onChange={(e) => {
            const { value } = e.target;
            if (value === "progression" || value === "delta") {
              setChartType(value);
            }
          }}
          aria-label="Chart type"
        >
          <option value="progression">Score Progression</option>
          {scoreDelta != null && <option value="delta">Score Delta</option>}
        </select>
      </div>
      {effectiveChartType === "delta" && scoreDelta != null ? (
        <DeltaChart
          durationMs={durationMs}
          scoreDelta={scoreDelta}
          team0Color={teamLines[0]?.color ?? "#8fa3b0"}
          team1Color={teamLines[1]?.color ?? "#8fa3b0"}
          team0Name={teamLines[0]?.name ?? "Team 1"}
          team1Name={teamLines[1]?.name ?? "Team 2"}
        />
      ) : (
        <ProgressionChart durationMs={durationMs} teamLines={teamLines} />
      )}
    </div>
  );
}
