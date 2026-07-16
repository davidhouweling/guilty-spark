import React from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AXIS_STROKE,
  CHART_HEIGHT,
  CHART_MARGIN,
  GRID_STROKE,
  TICK_STYLE,
  formatAdvantage,
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
  playerAdvantage,
  tooltipFormatter,
}: ScoreProgressionDeltaViewModel): React.ReactElement {
  const { points, minScore, maxScore, zeroFraction } = scoreDelta;
  const gradientId = React.useId();
  const strokeGradientId = `${gradientId}-stroke`;
  const advantageGradientId = `${gradientId}-advantage`;
  const zeroPercent = `${(zeroFraction * 100).toFixed(2)}%`;
  const margin = playerAdvantage != null ? { ...CHART_MARGIN, right: 36 } : CHART_MARGIN;
  const plotTop = CHART_MARGIN.top;
  const plotBottom = CHART_HEIGHT - CHART_MARGIN.bottom;
  const wrappedTooltipFormatter = (
    value: number | string | readonly (number | string)[] | undefined,
    name: string | number | undefined,
  ): [string, string] => {
    if (name === "Player Advantage") {
      return [typeof value === "number" ? formatAdvantage(value) : String(value), "Player Advantage"];
    }
    return tooltipFormatter(value);
  };

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <AreaChart margin={margin}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1={plotTop} x2="0" y2={plotBottom} gradientUnits="userSpaceOnUse">
            <stop offset={zeroPercent} stopColor={team0Color} stopOpacity={0.4} />
            <stop offset={zeroPercent} stopColor={team1Color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={team1Color} stopOpacity={0.4} />
          </linearGradient>
          <linearGradient
            id={strokeGradientId}
            x1="0"
            y1={plotTop}
            x2="0"
            y2={plotBottom}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset={zeroPercent} stopColor={team0Color} />
            <stop offset={zeroPercent} stopColor={team1Color} />
          </linearGradient>
          {playerAdvantage != null && (
            <linearGradient
              id={advantageGradientId}
              x1="0"
              y1={plotTop}
              x2="0"
              y2={plotBottom}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset={`${(playerAdvantage.zeroFraction * 100).toFixed(2)}%`} stopColor={team0Color} />
              <stop offset={`${(playerAdvantage.zeroFraction * 100).toFixed(2)}%`} stopColor={team1Color} />
            </linearGradient>
          )}
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke={GRID_STROKE} />
        <XAxis {...timeAxisProps(durationMs)} />
        <YAxis allowDecimals={false} width={36} domain={[minScore, maxScore]} stroke={AXIS_STROKE} tick={TICK_STYLE} />
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
        <ReferenceLine y={0} stroke={AXIS_STROKE} strokeDasharray="3 3" />
        <Tooltip
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          labelFormatter={formatTooltipLabel}
          formatter={wrappedTooltipFormatter}
        />
        <Area
          data={points}
          dataKey="score"
          baseValue={0}
          stroke={`url(#${strokeGradientId})`}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          type="stepAfter"
        />
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
