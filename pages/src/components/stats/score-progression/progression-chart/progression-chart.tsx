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
import type { ScoreProgressionProgressionViewModel } from "../types";

interface MarkerDotProps {
  readonly markerLabel: string;
  readonly cx?: number | undefined;
  readonly cy?: number | undefined;
  readonly r?: number | undefined;
  readonly fill?: string | undefined;
  readonly stroke?: string | undefined;
  readonly strokeWidth?: number | undefined;
}

// ReferenceDot alone renders a mute circle; an svg <title> gives each marker a native hover
// description ("Cobra captured a zone · 4:10")
function MarkerDot({ markerLabel, cx, cy, r, fill, stroke, strokeWidth }: MarkerDotProps): React.ReactElement | null {
  if (cx == null || cy == null) {
    return null;
  }
  return (
    <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth}>
      <title>{markerLabel}</title>
    </circle>
  );
}

export function ProgressionChart({
  durationMs,
  teamLines,
  playerAdvantage,
  zoneAdvantage,
  advantageDomain,
  markers,
  tooltipFormatter,
}: ScoreProgressionProgressionViewModel): React.ReactElement {
  const margin = chartMargin(advantageDomain);

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <AreaChart margin={margin}>
        <CartesianGrid strokeDasharray="4 4" stroke={GRID_STROKE} />
        <XAxis {...timeAxisProps(durationMs)} />
        <YAxis allowDecimals={false} width={36} stroke={AXIS_STROKE} tick={TICK_STYLE} />
        {advantageDomain != null && <YAxis {...advantageAxisProps(advantageDomain)} />}
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
        {advantageDomain != null && (
          <ReferenceLine y={0} yAxisId="advantage" stroke={AXIS_STROKE} strokeDasharray="3 3" />
        )}
        {playerAdvantage != null && <Area {...playerAdvantageAreaProps()} data={playerAdvantage.points} />}
        {zoneAdvantage != null && <Area {...zoneAdvantageAreaProps()} data={zoneAdvantage.points} />}
        {markers?.map((marker, index) => (
          <ReferenceDot
            key={`${String(index)}-${String(marker.timestampMs)}`}
            x={marker.timestampMs}
            y={marker.score}
            r={4}
            fill={marker.kind === "capture" ? marker.color : "transparent"}
            stroke={marker.color}
            strokeWidth={1.5}
            shape={<MarkerDot markerLabel={marker.label} />}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
