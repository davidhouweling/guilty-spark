import React from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ScoreProgressionTeamLine } from "../types";

export interface ProgressionChartProps {
  readonly durationMs: number;
  readonly teamLines: readonly ScoreProgressionTeamLine[];
}

const GRID_STROKE = "rgba(93, 212, 216, 0.12)";
const AXIS_STROKE = "rgba(93, 212, 216, 0.3)";
const TICK_FILL = "#8fa3b0";
const TICK_FONT_SIZE = 11;

const tooltipContentStyle = {
  background: "var(--halo-bg-card)",
  border: "1px solid rgba(93, 212, 216, 0.3)",
  borderRadius: "var(--radius-base)",
  color: "var(--halo-white)",
  fontSize: "12px",
};

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, "0")}`;
}

export function ProgressionChart({ durationMs, teamLines }: ProgressionChartProps): React.ReactElement {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
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
          stroke={AXIS_STROKE}
          tick={{ fill: TICK_FILL, fontSize: TICK_FONT_SIZE }}
        />
        <Tooltip
          contentStyle={tooltipContentStyle}
          labelStyle={{ color: TICK_FILL }}
          labelFormatter={(label) => (typeof label === "number" ? formatTime(label) : String(label ?? ""))}
          formatter={(value, name) => [value ?? "", name]}
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
      </AreaChart>
    </ResponsiveContainer>
  );
}
