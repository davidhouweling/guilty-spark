import React from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AXIS_STROKE,
  CHART_HEIGHT,
  CHART_MARGIN,
  CHART_PLOT_HEIGHT,
  GRID_STROKE,
  TICK_FILL,
  TICK_STYLE,
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
  tooltipFormatter,
}: ScoreProgressionProgressionViewModel): React.ReactElement {
  const advantageGradientId = React.useId();
  const team0Color = teamLines[0]?.color ?? TICK_FILL;
  const team1Color = teamLines[1]?.color ?? TICK_FILL;
  const margin = playerAdvantage != null ? { ...CHART_MARGIN, right: 36 } : CHART_MARGIN;

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <AreaChart margin={margin}>
        {playerAdvantage != null && (
          <defs>
            <linearGradient
              id={advantageGradientId}
              x1="0"
              y1={0}
              x2="0"
              y2={CHART_PLOT_HEIGHT}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset={`${(playerAdvantage.zeroFraction * 100).toFixed(2)}%`} stopColor={team0Color} />
              <stop offset={`${(playerAdvantage.zeroFraction * 100).toFixed(2)}%`} stopColor={team1Color} />
            </linearGradient>
          </defs>
        )}
        <CartesianGrid strokeDasharray="4 4" stroke={GRID_STROKE} />
        <XAxis {...timeAxisProps(durationMs)} />
        <YAxis allowDecimals={false} width={36} stroke={AXIS_STROKE} tick={TICK_STYLE} />
        {playerAdvantage != null && (
          <YAxis
            yAxisId="advantage"
            orientation="right"
            allowDecimals={false}
            width={28}
            domain={[playerAdvantage.minScore, playerAdvantage.maxScore]}
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
        {playerAdvantage != null && (
          <>
            <ReferenceLine y={0} yAxisId="advantage" stroke={AXIS_STROKE} strokeDasharray="3 3" />
            <Area
              yAxisId="advantage"
              data={playerAdvantage.points}
              dataKey="score"
              name="Player Advantage"
              fill="none"
              stroke={`url(#${advantageGradientId})`}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              dot={false}
              type="stepAfter"
              baseValue={0}
            />
          </>
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
