import React from "react";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { Checkbox } from "../../checkbox/checkbox";
import { ChartFrame } from "./chart-frame/chart-frame";
import { DeltaChart } from "./delta-chart/delta-chart";
import { FlagRunsCharts } from "./flag-runs-charts/flag-runs-charts";
import { ProgressionChart } from "./progression-chart/progression-chart";
import { TimelineGanttChart } from "./timeline-gantt-chart/timeline-gantt-chart";
import type { ScoreLinesViewModel, ScoreProgressionViewModel } from "./types";
import styles from "./score-progression.module.css";

function ScoreLinesCharts({
  ariaLabel,
  effectiveChartType,
  chartTypeOptions,
  showChartTypeSelect,
  hasPlayerAdvantage,
  hasMarkers,
  hasZoneAdvantage,
  showPlayerAdvantage,
  showMarkers,
  showZoneAdvantage,
  deltaViewModel,
  progressionViewModel,
  onChartTypeChange,
  onPlayerAdvantageChange,
  onMarkersChange,
  onZoneAdvantageChange,
}: ScoreLinesViewModel): React.ReactElement {
  const hasToggles = hasPlayerAdvantage || hasZoneAdvantage || hasMarkers;
  return (
    <ChartFrame
      ariaLabel={ariaLabel}
      chartType={effectiveChartType}
      chartTypeOptions={chartTypeOptions}
      showChartTypeSelect={showChartTypeSelect}
      toolbarExtras={
        hasToggles ? (
          <div className={styles.toolbarToggles}>
            {hasPlayerAdvantage && (
              <Checkbox checked={showPlayerAdvantage} onChange={onPlayerAdvantageChange} label="Player Advantage" />
            )}
            {hasZoneAdvantage && (
              <Checkbox checked={showZoneAdvantage} onChange={onZoneAdvantageChange} label="Zone Advantage" />
            )}
            {hasMarkers && <Checkbox checked={showMarkers} onChange={onMarkersChange} label="Captures & Secures" />}
          </div>
        ) : undefined
      }
      footer={
        progressionViewModel.markers != null ? (
          <div className={styles.markerLegend}>
            <span className={styles.markerLegendItem}>
              <svg width="10" height="10" aria-hidden="true">
                <circle cx="5" cy="5" r="4" fill="currentColor" />
              </svg>
              Capture
            </span>
            <span className={styles.markerLegendItem}>
              <svg width="10" height="10" aria-hidden="true">
                <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              Secure
            </span>
          </div>
        ) : undefined
      }
      onChartTypeChange={onChartTypeChange}
    >
      {effectiveChartType === "delta" && deltaViewModel != null ? (
        <DeltaChart {...deltaViewModel} />
      ) : (
        <ProgressionChart {...progressionViewModel} />
      )}
    </ChartFrame>
  );
}

export function ScoreProgression(props: ScoreProgressionViewModel): React.ReactElement {
  switch (props.kind) {
    case "score-lines": {
      return <ScoreLinesCharts {...props} />;
    }
    case "flag-runs": {
      return <FlagRunsCharts {...props} />;
    }
    case "timeline-gantt": {
      return (
        <ChartFrame
          ariaLabel={props.ariaLabel}
          chartType={props.effectiveChartType}
          chartTypeOptions={props.chartTypeOptions}
          showChartTypeSelect={props.showChartTypeSelect}
          onChartTypeChange={props.onChartTypeChange}
        >
          <TimelineGanttChart {...props.timeline} />
        </ChartFrame>
      );
    }
    default: {
      throw new UnreachableError(props);
    }
  }
}
