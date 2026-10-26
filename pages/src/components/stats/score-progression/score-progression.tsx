import React from "react";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { Checkbox } from "../../checkbox/checkbox";
import { ZONE_ADVANTAGE_SERIES } from "./chart-constants";
import { ChartFrame } from "./chart-frame/chart-frame";
import { DeltaChart } from "./delta-chart/delta-chart";
import { FlagRunsCharts } from "./flag-runs-charts/flag-runs-charts";
import { LegendItem } from "./legend-item/legend-item";
import { PlayerAdvantageToggle } from "./player-advantage-toggle/player-advantage-toggle";
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
          <>
            {hasPlayerAdvantage && (
              <PlayerAdvantageToggle checked={showPlayerAdvantage} onChange={onPlayerAdvantageChange} />
            )}
            {hasZoneAdvantage && (
              <Checkbox checked={showZoneAdvantage} onChange={onZoneAdvantageChange} label={ZONE_ADVANTAGE_SERIES} />
            )}
            {hasMarkers && <Checkbox checked={showMarkers} onChange={onMarkersChange} label="Captures & Secures" />}
          </>
        ) : undefined
      }
      footer={
        progressionViewModel.markers != null ? (
          <div className={styles.markerLegend}>
            <LegendItem swatch={<circle cx="7" cy="7" r="4" fill="currentColor" />} text="Capture" />
            <LegendItem
              swatch={<circle cx="7" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />}
              text="Secure"
            />
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
