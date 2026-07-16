import React from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
import type { ScoreProgressionDeltaViewModel } from "../types";

export function DeltaChart({
  durationMs,
  scoreDelta,
  team0Color,
  team1Color,
  tooltipFormatter,
}: ScoreProgressionDeltaViewModel): React.ReactElement {
  const { points, minScore, maxScore, zeroFraction } = scoreDelta;
  const gradientId = React.useId();
  const strokeGradientId = `${gradientId}-stroke`;
  const zeroPercent = `${(zeroFraction * 100).toFixed(2)}%`;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={points} margin={CHART_MARGIN}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset={zeroPercent} stopColor={team0Color} stopOpacity={0.4} />
            <stop offset={zeroPercent} stopColor={team1Color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={team1Color} stopOpacity={0.4} />
          </linearGradient>
          <linearGradient id={strokeGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset={zeroPercent} stopColor={team0Color} />
            <stop offset={zeroPercent} stopColor={team1Color} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke={GRID_STROKE} />
        <XAxis {...timeAxisProps(durationMs)} />
        <YAxis allowDecimals={false} width={36} domain={[minScore, maxScore]} stroke={AXIS_STROKE} tick={TICK_STYLE} />
        <ReferenceLine y={0} stroke={AXIS_STROKE} strokeDasharray="3 3" />
        <Tooltip
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          labelFormatter={formatTooltipLabel}
          formatter={tooltipFormatter}
        />
        <Area
          dataKey="score"
          baseValue={0}
          stroke={`url(#${strokeGradientId})`}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          type="stepAfter"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
