import React from "react";
import classNames from "classnames";
import { ChartFrame } from "../chart-frame/chart-frame";
import { FlagRunMarker } from "../flag-runs-chart/flag-run-marker/flag-run-marker";
import { FlagRunsChart } from "../flag-runs-chart/flag-runs-chart";
import type { FlagRunsViewModel } from "../types";
import styles from "../score-progression.module.css";

export function FlagRunsCharts({
  ariaLabel,
  effectiveChartType,
  chartTypeOptions,
  showChartTypeSelect,
  legend,
  markerLegend,
  chart,
  onChartTypeChange,
}: FlagRunsViewModel): React.ReactElement {
  return (
    <ChartFrame
      ariaLabel={ariaLabel}
      chartType={effectiveChartType}
      chartTypeOptions={chartTypeOptions}
      showChartTypeSelect={showChartTypeSelect}
      footer={
        <>
          <div className={classNames(styles.markerLegend, styles.flagLegend)}>
            {legend.map((entry) => (
              <span key={entry.key} className={styles.markerLegendItem}>
                <svg width="10" height="10" aria-hidden="true">
                  <rect width="10" height="10" rx="2" fill={entry.color} />
                </svg>
                {entry.text}
              </span>
            ))}
          </div>
          <div className={classNames(styles.markerLegend, styles.flagLegend)}>
            {markerLegend.map((entry) => (
              <span key={entry.kind} className={styles.markerLegendItem}>
                <svg width="14" height="14" aria-hidden="true">
                  <FlagRunMarker kind={entry.kind} color="currentColor" cx={7} cy={7} />
                </svg>
                {entry.text}
              </span>
            ))}
          </div>
        </>
      }
      onChartTypeChange={onChartTypeChange}
    >
      <FlagRunsChart {...chart} />
    </ChartFrame>
  );
}
