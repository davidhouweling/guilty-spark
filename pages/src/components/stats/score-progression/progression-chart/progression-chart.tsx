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
  TICK_STYLE,
  ZONE_ADVANTAGE_STROKE,
  formatAdvantage,
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
        {advantageDomain != null && (
          <YAxis
            yAxisId="advantage"
            orientation="right"
            allowDecimals={false}
            width={28}
            domain={[advantageDomain[0], advantageDomain[1]]}
            stroke={AXIS_STROKE}
            tick={TICK_STYLE}
            tickFormatter={formatAdvantage}
          />
        )}
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
          <Area
            yAxisId="advantage"
            data={playerAdvantage.points}
            dataKey="score"
            name="Player Advantage"
            fill="none"
            stroke={ADVANTAGE_STROKE}
            strokeWidth={1}
            strokeDasharray={2}
            dot={false}
            type="stepAfter"
            baseValue={0}
          />
        )}
        {zoneAdvantage != null && (
          <Area
            yAxisId="advantage"
            data={zoneAdvantage.points}
            dataKey="score"
            name="Zone Advantage"
            fill="none"
            stroke={ZONE_ADVANTAGE_STROKE}
            strokeWidth={1}
            strokeDasharray={2}
            dot={false}
            type="stepAfter"
            baseValue={0}
          />
        )}
        {markers?.map((marker) => (
          <ReferenceDot
            key={`${String(marker.teamId)}-${String(marker.timestampMs)}-${marker.kind}`}
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
