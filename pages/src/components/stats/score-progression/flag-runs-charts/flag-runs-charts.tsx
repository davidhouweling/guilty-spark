import React from "react";
import classNames from "classnames";
import { ChartFrame } from "../chart-frame/chart-frame";
import { FlagRunMarker } from "../flag-runs-chart/flag-run-marker/flag-run-marker";
import { FlagRunsChart } from "../flag-runs-chart/flag-runs-chart";
import { LegendItem } from "../legend-item/legend-item";
import { PlayerAdvantageToggle } from "../player-advantage-toggle/player-advantage-toggle";
import type { FlagRunsViewModel } from "../types";
import styles from "../score-progression.module.css";

export function FlagRunsCharts({
  ariaLabel,
  effectiveChartType,
  chartTypeOptions,
  showChartTypeSelect,
  legend,
  markerLegend,
  hasPlayerAdvantage,
  showPlayerAdvantage,
  chart,
  onChartTypeChange,
  onPlayerAdvantageChange,
}: FlagRunsViewModel): React.ReactElement {
  return (
    <ChartFrame
      ariaLabel={ariaLabel}
      chartType={effectiveChartType}
      chartTypeOptions={chartTypeOptions}
      showChartTypeSelect={showChartTypeSelect}
      toolbarExtras={
        hasPlayerAdvantage ? (
          <PlayerAdvantageToggle checked={showPlayerAdvantage} onChange={onPlayerAdvantageChange} />
        ) : undefined
      }
      footer={
        <>
          <div className={classNames(styles.markerLegend, styles.flagLegend)}>
            {legend.map((entry) => (
              <LegendItem
                key={entry.key}
                swatch={<rect x="2" y="2" width="10" height="10" rx="2" fill={entry.color} />}
                text={entry.text}
              />
            ))}
          </div>
          {markerLegend.length > 0 && (
            <div className={classNames(styles.markerLegend, styles.flagLegend)}>
              {markerLegend.map((entry) => (
                <LegendItem
                  key={entry.kind}
                  swatch={<FlagRunMarker kind={entry.kind} color="currentColor" cx={7} cy={7} />}
                  text={entry.text}
                />
              ))}
            </div>
          )}
        </>
      }
      onChartTypeChange={onChartTypeChange}
    >
      <FlagRunsChart {...chart} />
    </ChartFrame>
  );
}
