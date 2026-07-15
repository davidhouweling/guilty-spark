import React from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AXIS_STROKE,
  formatTime,
  formatTooltipLabel,
  GRID_STROKE,
  TICK_FILL,
  TICK_FONT_SIZE,
  tooltipContentStyle,
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
  const zeroPercent = `${(zeroFraction * 100).toFixed(2)}%`;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset={zeroPercent} stopColor={team0Color} stopOpacity={0.4} />
            <stop offset={zeroPercent} stopColor={team1Color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={team1Color} stopOpacity={0.4} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke={GRID_STROKE} />
        <XAxis
          type="number"
          dataKey="timestampMs"
          domain={[0, durationMs]}
          tickCount={6}
          tickFormatter={formatTime}
          stroke={AXIS_STROKE}
          tick={{ fill: TICK_FILL, fontSize: TICK_FONT_SIZE }}
        />
        <YAxis
          allowDecimals={false}
          width={36}
          domain={[minScore, maxScore]}
          stroke={AXIS_STROKE}
          tick={{ fill: TICK_FILL, fontSize: TICK_FONT_SIZE }}
        />
        <ReferenceLine y={0} stroke={AXIS_STROKE} strokeDasharray="3 3" />
        <Tooltip
          contentStyle={tooltipContentStyle}
          labelStyle={{ color: TICK_FILL }}
          labelFormatter={formatTooltipLabel}
          formatter={tooltipFormatter}
        />
        <Area
          dataKey="score"
          baseValue={0}
          stroke={TICK_FILL}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          type="stepAfter"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
