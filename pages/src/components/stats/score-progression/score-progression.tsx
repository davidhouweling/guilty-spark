import React from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ScoreDeltaData, ScoreProgressionTeamLine } from "./types";
import styles from "./score-progression.module.css";

interface ScoreProgressionProps {
  readonly durationMs: number;
  readonly teamLines: readonly ScoreProgressionTeamLine[];
  readonly scoreDelta: ScoreDeltaData | null;
  readonly ariaLabel: string;
}

type ChartType = "progression" | "delta";

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

const tooltipContentStyle = {
  background: "var(--halo-bg-card)",
  border: "1px solid rgba(93, 212, 216, 0.3)",
  borderRadius: "var(--radius-base)",
  color: "var(--halo-white)",
  fontSize: "12px",
};

interface ProgressionChartProps {
  readonly durationMs: number;
  readonly teamLines: readonly ScoreProgressionTeamLine[];
}

function ProgressionChart({ durationMs, teamLines }: ProgressionChartProps): React.ReactElement {
  return (
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
  );
}

interface DeltaChartProps {
  readonly durationMs: number;
  readonly scoreDelta: ScoreDeltaData;
  readonly team0Color: string;
  readonly team1Color: string;
  readonly team0Name: string;
  readonly team1Name: string;
}

function DeltaChart({
  durationMs,
  scoreDelta,
  team0Color,
  team1Color,
  team0Name,
  team1Name,
}: DeltaChartProps): React.ReactElement {
  const { points, minScore, maxScore, zeroFraction } = scoreDelta;
  const zeroPercent = `${String(Math.round(zeroFraction * 100))}%`;

  return (
    <AreaChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
      <defs>
        <linearGradient id="scoreDeltaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={team0Color} stopOpacity={0.4} />
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
        formatter={(value) => {
          if (typeof value !== "number" || value === 0) {
            return ["Tied", "Score Delta"];
          }
          const leader = value > 0 ? team0Name : team1Name;
          return [`${leader} +${String(Math.abs(value))}`, "Score Delta"];
        }}
      />
      <Area
        dataKey="score"
        stroke={TICK_FILL}
        strokeWidth={2}
        fill="url(#scoreDeltaGradient)"
        dot={false}
        type="linear"
      />
    </AreaChart>
  );
}

export function ScoreProgression({
  durationMs,
  teamLines,
  scoreDelta,
  ariaLabel,
}: ScoreProgressionProps): React.ReactElement {
  const [chartType, setChartType] = React.useState<ChartType>("progression");

  const effectiveChartType: ChartType = chartType === "delta" && scoreDelta == null ? "progression" : chartType;

  return (
    <div className={styles.container} role="img" aria-label={ariaLabel}>
      <div className={styles.toolbar}>
        <select
          className={styles.chartSelect}
          value={effectiveChartType}
          onChange={(e) => {
            setChartType(e.target.value as ChartType);
          }}
          aria-label="Chart type"
        >
          <option value="progression">Score Progression</option>
          {scoreDelta != null && <option value="delta">Score Delta</option>}
        </select>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        {effectiveChartType === "delta" && scoreDelta != null ? (
          <DeltaChart
            durationMs={durationMs}
            scoreDelta={scoreDelta}
            team0Color={teamLines[0]?.color ?? TICK_FILL}
            team1Color={teamLines[1]?.color ?? TICK_FILL}
            team0Name={teamLines[0]?.name ?? "Team 1"}
            team1Name={teamLines[1]?.name ?? "Team 2"}
          />
        ) : (
          <ProgressionChart durationMs={durationMs} teamLines={teamLines} />
        )}
      </ResponsiveContainer>
    </div>
  );
}
