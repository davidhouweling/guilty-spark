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
  CHART_MARGIN,
  GRID_STROKE,
  TICK_STYLE,
  flagAxisProps,
  formatTooltipLabel,
  timeAxisProps,
  tooltipContentStyle,
  tooltipLabelStyle,
} from "../chart-constants";
import type { FlagRunsChartViewModel } from "../types";
import { FlagRunMarker } from "./flag-run-marker/flag-run-marker";

export function FlagRunsChart({
  durationMs,
  runs,
  points,
  tooltipFormatter,
}: FlagRunsChartViewModel): React.ReactElement {
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <AreaChart data={points} margin={CHART_MARGIN}>
        <CartesianGrid strokeDasharray="4 4" stroke={GRID_STROKE} />
        <XAxis {...timeAxisProps(durationMs)} />
        <YAxis {...flagAxisProps()} stroke={AXIS_STROKE} tick={TICK_STYLE} />
        <ReferenceLine y={0} stroke={AXIS_STROKE} />
        <Tooltip
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          labelFormatter={formatTooltipLabel}
          formatter={tooltipFormatter}
        />
        {runs.map((run) => (
          <Area
            key={run.seriesKey}
            dataKey={run.seriesKey}
            name={run.seriesName}
            stroke={run.color}
            strokeWidth={2}
            fill={run.color}
            fillOpacity={0.25}
            baseValue={0}
            dot={false}
            type="linear"
          />
        ))}
        {runs.map((run) =>
          run.reset != null ? (
            <ReferenceLine
              key={`reset-${String(run.runIndex)}`}
              segment={[
                { x: run.reset.timestampMs, y: run.reset.fromProgress },
                { x: run.reset.timestampMs, y: 0 },
              ]}
              stroke={run.color}
              strokeDasharray="3 3"
            />
          ) : null,
        )}
        {runs.flatMap((run) =>
          run.markers.map((marker, markerIndex) => (
            <ReferenceDot
              key={`marker-${String(run.runIndex)}-${String(markerIndex)}`}
              x={marker.timestampMs}
              y={marker.progress}
              shape={<FlagRunMarker kind={marker.kind} color={run.color} />}
            />
          )),
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
