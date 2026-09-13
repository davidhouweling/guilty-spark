import React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AXIS_STROKE,
  CHART_HEIGHT,
  GRID_STROKE,
  TICK_STYLE,
  advantageAxisProps,
  chartMargin,
  roundBoundaryLineProps,
  playerAdvantageAreaProps,
  timeAxisProps,
  tooltipContentStyle,
  tooltipLabelStyle,
  formatTooltipLabel,
  zoneAdvantageAreaProps,
} from "../chart-constants";
import type { ScoreProgressionProgressionViewModel } from "../types";

export function ProgressionChart({
  durationMs,
  teamLines,
  playerAdvantage,
  zoneAdvantage,
  advantageDomain,
  markers,
  roundBoundaries,
  tooltipFormatter,
}: ScoreProgressionProgressionViewModel): React.ReactElement {
  const margin = chartMargin(advantageDomain);

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <AreaChart margin={margin}>
        <CartesianGrid strokeDasharray="4 4" stroke={GRID_STROKE} />
        <XAxis {...timeAxisProps(durationMs)} />
        <YAxis allowDecimals={false} width={36} stroke={AXIS_STROKE} tick={TICK_STYLE} />
        {advantageDomain != null && <YAxis {...advantageAxisProps(advantageDomain)} />}
        {roundBoundaries.map((boundaryMs) => (
          <ReferenceLine key={boundaryMs} {...roundBoundaryLineProps(boundaryMs)} />
        ))}
        <Tooltip
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          labelFormatter={formatTooltipLabel}
          formatter={tooltipFormatter}
        />
        {teamLines.map((line) => (
          <Area
            key={line.teamId}
            data={line.points}
            dataKey="score"
            name={line.name}
            stroke={line.color}
            strokeWidth={2}
            fill={line.color}
            fillOpacity={0.2}
            dot={false}
            type="linear"
          />
        ))}
        {advantageDomain != null && (
          <ReferenceLine y={0} yAxisId="advantage" stroke={AXIS_STROKE} strokeDasharray="3 3" />
        )}
        {playerAdvantage != null && <Area {...playerAdvantageAreaProps()} data={playerAdvantage.points} />}
        {zoneAdvantage != null && <Area {...zoneAdvantageAreaProps()} data={zoneAdvantage.points} />}
        {markers?.map((marker, index) => (
          <ReferenceDot
            key={`${String(index)}-${String(marker.timestampMs)}`}
            x={marker.timestampMs}
            y={marker.score}
            r={4}
            fill={marker.kind === "capture" ? marker.color : "transparent"}
            stroke={marker.color}
            strokeWidth={1.5}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
