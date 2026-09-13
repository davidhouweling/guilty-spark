import type { ScoreProgressionPoint } from "./types";

// carries a series' final value out to the match end without duplicating a point that already
// lands exactly on it
export function extendToDuration(points: ScoreProgressionPoint[], durationMs: number): void {
  const last = points.at(-1);
  if (last != null && last.timestampMs < durationMs) {
    points.push({ timestampMs: durationMs, score: last.score });
  }
}
