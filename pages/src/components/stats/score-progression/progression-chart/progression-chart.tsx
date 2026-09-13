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
  ADVANTAGE_STROKE,
  AXIS_STROKE,
  CHART_HEIGHT,
  CHART_MARGIN,
  GRID_STROKE,
  PLAYER_ADVANTAGE_SERIES,
  TICK_STYLE,
  ZONE_ADVANTAGE_SERIES,
  ZONE_ADVANTAGE_STROKE,
  advantageAreaProps,
  advantageAxisProps,
  timeAxisProps,
  tooltipContentStyle,
  tooltipLabelStyle,
  formatTooltipLabel,
} from "../chart-constants";
import type { ScoreProgressionProgressionViewModel } from "../types";

export function ProgressionChart({
  durationMs,
  teamLines,
  playerAdvantage,
  zoneAdvantage,
  advantageDomain,
  markers,
  tooltipFormatter,
}: ScoreProgressionProgressionViewModel): React.ReactElement {
  const margin = advantageDomain != null ? { ...CHART_MARGIN, right: 36 } : CHART_MARGIN;

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <AreaChart margin={margin}>
        <CartesianGrid strokeDasharray="4 4" stroke={GRID_STROKE} />
        <XAxis {...timeAxisProps(durationMs)} />
        <YAxis allowDecimals={false} width={36} stroke={AXIS_STROKE} tick={TICK_STYLE} />
        {advantageDomain != null && <YAxis {...advantageAxisProps(advantageDomain)} />}
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
        {playerAdvantage != null && (
          <Area {...advantageAreaProps(PLAYER_ADVANTAGE_SERIES, ADVANTAGE_STROKE)} data={playerAdvantage.points} />
        )}
        {zoneAdvantage != null && (
          <Area {...advantageAreaProps(ZONE_ADVANTAGE_SERIES, ZONE_ADVANTAGE_STROKE)} data={zoneAdvantage.points} />
        )}
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
