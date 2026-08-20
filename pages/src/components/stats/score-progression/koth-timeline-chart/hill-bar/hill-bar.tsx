import React from "react";
import { TICK_FILL } from "../../chart-constants";
import type { KothHillData, KothHillSegment } from "../../types";

export const WINNER_DOT_RADIUS = 5;
export const WINNER_DOT_OFFSET = 10;
const UNOCCUPIED_FILL = "rgba(255,255,255,0.08)";
const UNOCCUPIED_STROKE = "rgba(255,255,255,0.15)";
// Sub-second byte2 control blips render as white slivers once outlined — hide gaps this narrow.
const MIN_UNOCCUPIED_WIDTH_PX = 2;

function clampFraction(value: number): number {
  return Math.min(1, Math.max(0, value));
}

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
        const startFraction = clampFraction(segment.startMs / durationMs);
        const endFraction = clampFraction(segment.endMs / durationMs);
        if (endFraction <= startFraction) {
          return null;
        }
        const isOccupied = segment.teamId != null;
        const widthPx = (endFraction - startFraction) * bgWidth;
        if (!isOccupied && widthPx < MIN_UNOCCUPIED_WIDTH_PX) {
          return null;
        }
        return (
          <rect
            key={`${String(segment.startMs)}-${String(segment.endMs)}`}
            x={bgX + startFraction * bgWidth}
            y={y}
            width={isOccupied ? Math.max(1, widthPx) : widthPx}
            height={height}
            fill={isOccupied ? (segment.color ?? TICK_FILL) : UNOCCUPIED_FILL}
            opacity={isOccupied ? 0.8 : undefined}
            stroke={isOccupied ? undefined : UNOCCUPIED_STROKE}
            strokeWidth={isOccupied ? undefined : 0.5}
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
