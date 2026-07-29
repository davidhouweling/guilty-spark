import React from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { AXIS_STROKE, TICK_FILL, TICK_FONT_SIZE, TICK_STYLE, formatTime } from "../chart-constants";
import type { KothHillData, KothTimelineViewModel } from "../types";
import { HillBar } from "./hill-bar/hill-bar";
import styles from "./koth-timeline-chart.module.css";

const ROW_HEIGHT = 52;
const Y_AXIS_WIDTH = 168;
const WINNER_DOT_RADIUS = 5;
const WINNER_DOT_OFFSET = 10;

interface HillTickProps {
  x?: number;
  y?: number;
  payload?: { value: number };
  hills?: readonly KothHillData[];
}

function HillTick({ x = 0, y = 0, payload, hills = [] }: HillTickProps): React.ReactElement | null {
  if (payload == null) {
    return null;
  }
  const hill = hills.find((h) => h.hillIndex === payload.value);
  if (hill == null) {
    return null;
  }
  const occupancyText = hill.teamOccupancies.map((o) => `${o.name} ${String(o.percentage)}%`).join(" · ");

  return (
    <g transform={`translate(${String(x)},${String(y)})`}>
      <text x={-8} y={-5} textAnchor="end" fontSize={TICK_FONT_SIZE} fill={TICK_FILL}>
        Hill {hill.hillIndex}
      </text>
      <text x={-8} y={9} textAnchor="end" fontSize={10} fill={TICK_FILL} opacity={0.7}>
        {occupancyText}
      </text>
    </g>
  );
}

interface HillTooltipPayloadEntry {
  payload?: { hill: KothHillData };
}

interface HillTooltipProps {
  active?: boolean;
  payload?: HillTooltipPayloadEntry[];
}

function HillTooltip({ active, payload }: HillTooltipProps): React.ReactElement | null {
  if (active !== true) {
    return null;
  }
  const hill = payload?.[0]?.payload?.hill;
  if (hill == null) {
    return null;
  }

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipHill}>Hill {hill.hillIndex}</div>
      {hill.teamOccupancies.map((o) =>
        o.percentage > 0 ? (
          <div key={o.teamId} className={styles.tooltipTeam} style={{ "--team-color": o.color } as React.CSSProperties}>
            {o.name}: {o.percentage}%
          </div>
        ) : (
          <div key={o.teamId} className={styles.tooltipUnoccupied}>
            {o.name}: 0%
          </div>
        ),
      )}
    </div>
  );
}

export function KothTimelineChart({ durationMs, hills }: KothTimelineViewModel): React.ReactElement {
  const chartHeight = hills.length * ROW_HEIGHT + 40;
  const chartData = [...hills]
    .reverse()
    .map((hill) => ({ hillIndex: hill.hillIndex, value: durationMs, durationMs, hill }));

  const hillTick = <HillTick hills={hills} />;

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        layout="vertical"
        data={chartData}
        margin={{ top: 8, right: WINNER_DOT_OFFSET + WINNER_DOT_RADIUS + 8, bottom: 8, left: 8 }}
      >
        <XAxis
          type="number"
          domain={[0, durationMs]}
          tickCount={6}
          tickFormatter={formatTime}
          stroke={AXIS_STROKE}
          tick={TICK_STYLE}
        />
        <YAxis type="category" dataKey="hillIndex" width={Y_AXIS_WIDTH} tick={hillTick} stroke={AXIS_STROKE} />
        <Tooltip content={<HillTooltip />} cursor={false} />
        <Bar dataKey="value" shape={<HillBar durationMs={durationMs} />} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
