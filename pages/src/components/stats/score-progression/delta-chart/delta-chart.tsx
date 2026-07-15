import React from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AXIS_STROKE,
  formatTime,
  GRID_STROKE,
  TICK_FILL,
  TICK_FONT_SIZE,
  tooltipContentStyle,
} from "../chart-constants";
import type { ScoreDeltaData } from "../types";

export interface DeltaChartProps {
  readonly durationMs: number;
  readonly scoreDelta: ScoreDeltaData;
  readonly team0Color: string;
  readonly team1Color: string;
  readonly team0Name: string;
  readonly team1Name: string;
}

const DELTA_LABEL = "Score Delta";

export function formatDeltaTooltip(value: unknown, team0Name: string, team1Name: string): [string, string] {
  if (typeof value !== "number" || value === 0) {
    return ["Tied", DELTA_LABEL];
  }
  const leader = value > 0 ? team0Name : team1Name;
  return [`${leader} +${String(Math.abs(value))}`, DELTA_LABEL];
}

export function DeltaChart({
  durationMs,
  scoreDelta,
  team0Color,
  team1Color,
  team0Name,
  team1Name,
}: DeltaChartProps): React.ReactElement {
  const { points, minScore, maxScore, zeroFraction } = scoreDelta;
  const gradientId = React.useId();
  const zeroPercent = `${String(Math.round(zeroFraction * 100))}%`;

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
          labelFormatter={(label) => (typeof label === "number" ? formatTime(label) : String(label ?? ""))}
          formatter={(value) => formatDeltaTooltip(value, team0Name, team1Name)}
        />
        <Area dataKey="score" stroke={TICK_FILL} strokeWidth={2} fill={`url(#${gradientId})`} dot={false} type="step" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
