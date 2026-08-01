import React from "react";
import { TICK_FILL } from "../../chart-constants";
import type { KothHillData, KothHillSegment } from "../../types";

export const WINNER_DOT_RADIUS = 5;
export const WINNER_DOT_OFFSET = 10;
const UNOCCUPIED_FILL = "rgba(255,255,255,0.08)";
const UNOCCUPIED_STROKE = "rgba(255,255,255,0.15)";

export interface HillBarProps {
  y?: number;
  height?: number;
  // Recharts passes the full bar-background rect so segments are positioned relative to it
  background?: { x: number; y: number; width: number; height: number };
  durationMs?: number;
  hill?: KothHillData;
}

export function HillBar({
  y = 0,
  height = 0,
  background,
  durationMs = 1,
  hill,
}: HillBarProps): React.ReactElement | null {
  if (background == null || hill == null) {
    return null;
  }
  const { x: bgX, width: bgWidth } = background;

  return (
    <g>
      {hill.segments.map((segment: KothHillSegment) => {
        const segKey = `${String(segment.startMs)}-${String(segment.endMs)}`;
        const segX = bgX + (segment.startMs / durationMs) * bgWidth;
        const segWidth = Math.max(1, ((segment.endMs - segment.startMs) / durationMs) * bgWidth);
        if (segment.teamId != null) {
          return (
            <rect
              key={segKey}
              x={segX}
              y={y}
              width={segWidth}
              height={height}
              fill={segment.color ?? TICK_FILL}
              opacity={0.8}
            />
          );
        }
        return (
          <rect
            key={segKey}
            x={segX}
            y={y}
            width={segWidth}
            height={height}
            fill={UNOCCUPIED_FILL}
            stroke={UNOCCUPIED_STROKE}
            strokeWidth={0.5}
          />
        );
      })}
      {hill.winnerColor != null && (
        <circle
          cx={bgX + bgWidth + WINNER_DOT_OFFSET}
          cy={y + height / 2}
          r={WINNER_DOT_RADIUS}
          fill={hill.winnerColor}
        />
      )}
    </g>
  );
}
