import type { ScoreSample } from "./types";

export function zeroScores(teamIds: readonly number[]): Record<string, number> {
  return Object.fromEntries(teamIds.map((teamId) => [String(teamId), 0]));
}

export function carryScoresForward(
  cumulative: Record<string, number>,
  sample: ScoreSample,
  keys: readonly string[],
): void {
  for (const key of keys) {
    if (key in sample.runningScores) {
      cumulative[key] = sample.runningScores[key];
    }
  }
}
