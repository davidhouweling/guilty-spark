import React, { useId } from "react";
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
  GRID_STROKE,
  TICK_STYLE,
  advantageAxisProps,
  chartMargin,
  playerAdvantageAreaProps,
  timeAxisProps,
  tooltipContentStyle,
  tooltipLabelStyle,
  formatTooltipLabel,
  zoneAdvantageAreaProps,
} from "../chart-constants";
import type { ScoreProgressionDeltaViewModel } from "../types";

interface DeltaChartGradientsProps {
  readonly fillGradientId: string;
  readonly strokeGradientId: string;
  readonly team0Color: string;
  readonly team1Color: string;
}

function DeltaChartGradients({
  fillGradientId,
  strokeGradientId,
  team0Color,
  team1Color,
}: DeltaChartGradientsProps): React.ReactElement | null {
  const deltaScale = useYAxisScale(0);
  const plotArea = usePlotArea();
  if (deltaScale == null || plotArea == null) {
    return null;
  }
  const { height } = plotArea;
  const deltaZeroY = deltaScale(0);
  if (deltaZeroY == null) {
    return null;
  }
  const deltaOffset = `${((deltaZeroY / height) * 100).toFixed(2)}%`;

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
    </defs>
  );
}

export function DeltaChart({
  durationMs,
  roundBoundaries,
  scoreDelta,
  team0Color,
  team1Color,
  playerAdvantage,
  zoneAdvantage,
  advantageDomain,
  tooltipFormatter,
}: ScoreProgressionDeltaViewModel): React.ReactElement {
  const { points, minScore, maxScore } = scoreDelta;
  const gradientId = useId();
  const strokeGradientId = `${gradientId}-stroke`;
  const margin = chartMargin(advantageDomain);

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <AreaChart data={points} margin={margin}>
        <DeltaChartGradients
          fillGradientId={gradientId}
          strokeGradientId={strokeGradientId}
          team0Color={team0Color}
          team1Color={team1Color}
        />
        <CartesianGrid strokeDasharray="4 4" stroke={GRID_STROKE} />
        <XAxis {...timeAxisProps(durationMs)} />
        <YAxis allowDecimals={false} width={36} domain={[minScore, maxScore]} stroke={AXIS_STROKE} tick={TICK_STYLE} />
        {advantageDomain != null && <YAxis {...advantageAxisProps(advantageDomain)} />}
        <ReferenceLine y={0} stroke={AXIS_STROKE} strokeDasharray="3 3" />
        {roundBoundaries?.map((boundaryMs) => (
          <ReferenceLine key={boundaryMs} x={boundaryMs} stroke={AXIS_STROKE} strokeDasharray="3 3" />
        ))}
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
          type={scoreDelta.lineType === "linear" ? "linear" : "stepAfter"}
        />
        {advantageDomain != null && (
          <ReferenceLine y={0} yAxisId="advantage" stroke={AXIS_STROKE} strokeDasharray="3 3" />
        )}
        {playerAdvantage != null && <Area {...playerAdvantageAreaProps()} data={playerAdvantage.points} />}
        {zoneAdvantage != null && <Area {...zoneAdvantageAreaProps()} data={zoneAdvantage.points} />}
      </AreaChart>
    </ResponsiveContainer>
  );
}
