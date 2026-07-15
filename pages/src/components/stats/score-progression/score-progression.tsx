import React from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ScoreProgressionTeamLine } from "./types";
import styles from "./score-progression.module.css";

interface ScoreProgressionProps {
  readonly durationMs: number;
  readonly teamLines: readonly ScoreProgressionTeamLine[];
  readonly ariaLabel: string;
}

const GRID_STROKE = "rgba(93, 212, 216, 0.12)";
const AXIS_STROKE = "rgba(93, 212, 216, 0.3)";
const TICK_FILL = "#8fa3b0";
const TICK_FONT_SIZE = 11;

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, "0")}`;
}

export function ScoreProgression({ durationMs, teamLines, ariaLabel }: ScoreProgressionProps): React.ReactElement {
  return (
    <div className={styles.container} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
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
            contentStyle={{
              background: "var(--halo-bg-card)",
              border: "1px solid rgba(93, 212, 216, 0.3)",
              borderRadius: "var(--radius-base)",
              color: "var(--halo-white)",
              fontSize: "12px",
            }}
            labelStyle={{ color: TICK_FILL }}
            labelFormatter={(label) => (typeof label === "number" ? formatTime(label) : String(label ?? ""))}
            formatter={(value) => [value ?? "", "Score"]}
          />
          {teamLines.map((line) => (
            <Line
              key={line.teamId}
              data={line.points}
              dataKey="score"
              stroke={line.color}
              strokeWidth={2}
              dot={false}
              type="linear"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
