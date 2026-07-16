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
  TICK_FILL,
  TICK_STYLE,
  formatAdvantage,
  timeAxisProps,
  tooltipContentStyle,
  tooltipLabelStyle,
  formatTooltipLabel,
} from "../chart-constants";
import type { ScoreProgressionProgressionViewModel } from "../types";

interface AdvantageGradientProps {
  readonly id: string;
  readonly team0Color: string;
  readonly team1Color: string;
}

function AdvantageGradient({ id, team0Color, team1Color }: AdvantageGradientProps): React.ReactElement | null {
  const advantageScale = useYAxisScale("advantage");
  const plotArea = usePlotArea();
  if (advantageScale == null || plotArea == null) {
    return null;
  }
  const { height } = plotArea;
  const zeroY = advantageScale(0);
  if (zeroY == null) {
    return null;
  }
  const offset = `${((zeroY / height) * 100).toFixed(2)}%`;

  return (
    <defs>
      <linearGradient id={id} x1="0" y1={0} x2="0" y2={height} gradientUnits="userSpaceOnUse">
        <stop offset={offset} stopColor={team0Color} />
        <stop offset={offset} stopColor={team1Color} />
      </linearGradient>
    </defs>
  );
}

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
          <AdvantageGradient id={advantageGradientId} team0Color={team0Color} team1Color={team1Color} />
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
