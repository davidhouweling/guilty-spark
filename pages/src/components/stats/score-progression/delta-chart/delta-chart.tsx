import React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  useYAxisScale,
} from "recharts";
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

interface DeltaChartGradientsProps {
  readonly fillGradientId: string;
  readonly strokeGradientId: string;
  readonly advantageGradientId: string;
  readonly team0Color: string;
  readonly team1Color: string;
  readonly hasPlayerAdvantage: boolean;
}

function DeltaChartGradients({
  fillGradientId,
  strokeGradientId,
  advantageGradientId,
  team0Color,
  team1Color,
  hasPlayerAdvantage,
}: DeltaChartGradientsProps): React.ReactElement | null {
  const deltaScale = useYAxisScale(0);
  const advantageScale = useYAxisScale("advantage");
  const plotArea = usePlotArea();
  if (deltaScale == null || plotArea == null) {
    return null;
  }
  const {height} = plotArea;
  const deltaZeroY = deltaScale(0);
  if (deltaZeroY == null) {
    return null;
  }
  const deltaOffset = `${((deltaZeroY / height) * 100).toFixed(2)}%`;
  const advantageZeroY = advantageScale?.(0);
  const advantageOffset = advantageZeroY != null ? `${((advantageZeroY / height) * 100).toFixed(2)}%` : "50%";

  return (
    <defs>
      <linearGradient id={fillGradientId} x1="0" y1={0} x2="0" y2={height} gradientUnits="userSpaceOnUse">
        <stop offset={deltaOffset} stopColor={team0Color} stopOpacity={0.4} />
        <stop offset={deltaOffset} stopColor={team1Color} stopOpacity={0.4} />
        <stop offset="100%" stopColor={team1Color} stopOpacity={0.4} />
      </linearGradient>
      <linearGradient id={strokeGradientId} x1="0" y1={0} x2="0" y2={height} gradientUnits="userSpaceOnUse">
        <stop offset={deltaOffset} stopColor={team0Color} />
        <stop offset={deltaOffset} stopColor={team1Color} />
      </linearGradient>
      {hasPlayerAdvantage && (
        <linearGradient id={advantageGradientId} x1="0" y1={0} x2="0" y2={height} gradientUnits="userSpaceOnUse">
          <stop offset={advantageOffset} stopColor={team0Color} />
          <stop offset={advantageOffset} stopColor={team1Color} />
        </linearGradient>
      )}
    </defs>
  );
}

export function DeltaChart({
  durationMs,
  scoreDelta,
  team0Color,
  team1Color,
  playerAdvantage,
  tooltipFormatter,
  advantageTooltipFormatter,
}: ScoreProgressionDeltaViewModel): React.ReactElement {
  const { points, minScore, maxScore } = scoreDelta;
  const gradientId = React.useId();
  const strokeGradientId = `${gradientId}-stroke`;
  const advantageGradientId = `${gradientId}-advantage`;
  const margin = playerAdvantage != null ? { ...CHART_MARGIN, right: 36 } : CHART_MARGIN;
  const wrappedTooltipFormatter = (
    value: number | string | readonly (number | string)[] | undefined,
    name: string | number | undefined,
  ): [string, string] => {
    if (name === "Player Advantage") {
      return advantageTooltipFormatter(value);
    }
    return tooltipFormatter(value);
  };

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <AreaChart data={points} margin={margin}>
        <DeltaChartGradients
          fillGradientId={gradientId}
          strokeGradientId={strokeGradientId}
          advantageGradientId={advantageGradientId}
          team0Color={team0Color}
          team1Color={team1Color}
          hasPlayerAdvantage={playerAdvantage != null}
        />
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
