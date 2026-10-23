import React from "react";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { Checkbox } from "../../checkbox/checkbox";
import { ChartTypeSelect } from "./chart-type-select/chart-type-select";
import { DeltaChart } from "./delta-chart/delta-chart";
import { FlagRunsChart } from "./flag-runs-chart/flag-runs-chart";
import { ProgressionChart } from "./progression-chart/progression-chart";
import { TimelineGanttChart } from "./timeline-gantt-chart/timeline-gantt-chart";
import type { FlagRunsViewModel, ScoreLinesViewModel, ScoreProgressionViewModel } from "./types";
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

const FLAG_MARKER_LEGEND = [
  { key: "steal", symbol: "●", text: "Steal" },
  { key: "grab", symbol: "○", text: "Pickup" },
  { key: "drop", symbol: "✕", text: "Carrier killed" },
  { key: "return", symbol: "◆", text: "Returned" },
  { key: "capture", symbol: "▲", text: "Captured" },
] as const;

function FlagRunsCharts({
  ariaLabel,
  effectiveChartType,
  chartTypeOptions,
  showChartTypeSelect,
  legend,
  chart,
  onChartTypeChange,
}: FlagRunsViewModel): React.ReactElement {
  return (
    <div className={styles.container}>
      {showChartTypeSelect && (
        <div className={styles.toolbar}>
          <ChartTypeSelect value={effectiveChartType} options={chartTypeOptions} onChange={onChartTypeChange} />
        </div>
      )}
      <div role="img" aria-label={ariaLabel}>
        <FlagRunsChart {...chart} />
      </div>
      <div className={styles.markerLegend}>
        {legend.map((entry) => (
          <span key={entry.key} className={styles.markerLegendItem}>
            <svg width="10" height="10" aria-hidden="true">
              <rect width="10" height="10" rx="2" fill={entry.color} />
            </svg>
            {entry.text}
          </span>
        ))}
      </div>
      <div className={styles.markerLegend}>
        {FLAG_MARKER_LEGEND.map((entry) => (
          <span key={entry.key} className={styles.markerLegendItem}>
            <span aria-hidden="true">{entry.symbol}</span>
            {entry.text}
          </span>
        ))}
      </div>
    </div>
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
