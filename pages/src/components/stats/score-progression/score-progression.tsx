import React from "react";
import type { ScoreProgressionViewData } from "./types";
import styles from "./score-progression.module.css";

interface ScoreProgressionProps {
  readonly viewData: ScoreProgressionViewData;
  readonly ariaLabel: string;
}

const VIEWBOX_WIDTH = 600;
const VIEWBOX_HEIGHT = 260;
const PAD_TOP = 16;
const PAD_RIGHT = 16;
const PAD_BOTTOM = 36;
const PAD_LEFT = 44;
const PLOT_WIDTH = VIEWBOX_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT = VIEWBOX_HEIGHT - PAD_TOP - PAD_BOTTOM;
const TICK_COUNT = 5;

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, "0")}`;
}

function toSvgX(timestampMs: number, durationMs: number): number {
  return PAD_LEFT + (timestampMs / durationMs) * PLOT_WIDTH;
}

function toSvgY(score: number, maxScore: number): number {
  if (maxScore === 0) {
    return PAD_TOP + PLOT_HEIGHT;
  }
  return PAD_TOP + PLOT_HEIGHT - (score / maxScore) * PLOT_HEIGHT;
}

function buildPolylinePoints(
  points: ScoreProgressionViewData["teamLines"][number]["points"],
  durationMs: number,
  maxScore: number,
): string {
  return points.map((p) => `${toSvgX(p.timestampMs, durationMs).toFixed(1)},${toSvgY(p.score, maxScore).toFixed(1)}`).join(" ");
}

export function ScoreProgression({ viewData, ariaLabel }: ScoreProgressionProps): React.ReactElement {
  const { durationMs, teamLines } = viewData;

  const maxScore = Math.max(1, ...teamLines.flatMap((line) => line.points.map((p) => p.score)));

  const xTicks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => (i / TICK_COUNT) * durationMs);
  const yTicks = Array.from({ length: maxScore + 1 }, (_, i) => i);

  const plotBottom = PAD_TOP + PLOT_HEIGHT;
  const plotRight = PAD_LEFT + PLOT_WIDTH;

  return (
    <svg
      viewBox={[0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT].join(" ")}
      className={styles.chart}
      aria-label={ariaLabel}
      role="img"
    >
      {xTicks.map((t) => {
        const x = toSvgX(t, durationMs);
        return (
          <React.Fragment key={t}>
            <line x1={x} y1={PAD_TOP} x2={x} y2={plotBottom} className={styles.gridLine} />
            <text x={x} y={plotBottom + 14} className={styles.axisLabel} textAnchor="middle">
              {formatTime(t)}
            </text>
          </React.Fragment>
        );
      })}

      {yTicks.map((s) => {
        const y = toSvgY(s, maxScore);
        return (
          <React.Fragment key={s}>
            <line x1={PAD_LEFT} y1={y} x2={plotRight} y2={y} className={styles.gridLine} />
            <text x={PAD_LEFT - 6} y={y + 4} className={styles.axisLabel} textAnchor="end">
              {s}
            </text>
          </React.Fragment>
        );
      })}

      <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={plotBottom} className={styles.axis} />
      <line x1={PAD_LEFT} y1={plotBottom} x2={plotRight} y2={plotBottom} className={styles.axis} />

      {teamLines.map((line) => (
        <polyline
          key={line.teamId}
          points={buildPolylinePoints(line.points, durationMs, maxScore)}
          fill="none"
          stroke={line.color}
          strokeWidth="2"
          strokeLinejoin="round"
          className={styles.teamLine}
        />
      ))}
    </svg>
  );
}
