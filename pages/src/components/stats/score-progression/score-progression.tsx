import React from "react";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { Checkbox } from "../../checkbox/checkbox";
import { ChartTypeSelect } from "./chart-type-select/chart-type-select";
import { DeltaChart } from "./delta-chart/delta-chart";
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
  showToolbar,
  deltaViewModel,
  progressionViewModel,
  onChartTypeChange,
  onPlayerAdvantageChange,
  onMarkersChange,
  onZoneAdvantageChange,
}: ScoreLinesViewModel): React.ReactElement {
  return (
    <div className={styles.container}>
      {showToolbar && (
        <div className={styles.toolbar}>
          {showChartTypeSelect && (
            <ChartTypeSelect value={effectiveChartType} options={chartTypeOptions} onChange={onChartTypeChange} />
          )}
          {(hasPlayerAdvantage || hasZoneAdvantage || hasMarkers) && (
            <div className={styles.toolbarToggles}>
              {hasPlayerAdvantage && (
                <Checkbox checked={showPlayerAdvantage} onChange={onPlayerAdvantageChange} label="Player Advantage" />
              )}
              {hasZoneAdvantage && (
                <Checkbox checked={showZoneAdvantage} onChange={onZoneAdvantageChange} label="Zone Advantage" />
              )}
              {hasMarkers && <Checkbox checked={showMarkers} onChange={onMarkersChange} label="Captures & Secures" />}
            </div>
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
      {progressionViewModel.markers != null && (
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
      )}
    </div>
  );
}

export function ScoreProgression(props: ScoreProgressionViewModel): React.ReactElement {
  switch (props.kind) {
    case "score-lines": {
      return <ScoreLinesCharts {...props} />;
    }
    case "timeline-gantt": {
      return (
        <div className={styles.container}>
          {props.showChartTypeSelect && (
            <div className={styles.toolbar}>
              <ChartTypeSelect
                value={props.effectiveChartType}
                options={props.chartTypeOptions}
                onChange={props.onChartTypeChange}
              />
            </div>
          )}
          <div role="img" aria-label={props.ariaLabel}>
            <TimelineGanttChart {...props.timeline} />
          </div>
        </div>
      );
    }
    default: {
      throw new UnreachableError(props);
    }
  }
}
