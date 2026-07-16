import React from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AXIS_STROKE,
  CHART_MARGIN,
  GRID_STROKE,
  TICK_STYLE,
  timeAxisProps,
  tooltipContentStyle,
  tooltipLabelStyle,
  formatTooltipLabel,
} from "../chart-constants";
import type { ScoreProgressionProgressionViewModel } from "../types";

export function ProgressionChart({ durationMs, teamLines }: ScoreProgressionProgressionViewModel): React.ReactElement {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart margin={CHART_MARGIN}>
        <CartesianGrid strokeDasharray="4 4" stroke={GRID_STROKE} />
        <XAxis {...timeAxisProps(durationMs)} />
        <YAxis allowDecimals={false} width={36} stroke={AXIS_STROKE} tick={TICK_STYLE} />
        <Tooltip
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          labelFormatter={formatTooltipLabel}
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
      </AreaChart>
    </ResponsiveContainer>
  );
}
