import { Preconditions } from "../../base/preconditions.mts";
import type { LiveTrackerMatchRenderModel } from "../live-tracker/types";

export interface SeriesMetadata {
  readonly score: string;
  readonly duration: string;
  readonly startTime: string;
  readonly endTime: string;
}

export function calculateSeriesMetadata(
  matches: readonly LiveTrackerMatchRenderModel[],
  seriesScore: string,
): SeriesMetadata | null {
  if (matches.length === 0) {
    return null;
  }

  const firstMatch = Preconditions.checkExists(matches[0]);
  const lastMatch = Preconditions.checkExists(matches[matches.length - 1]);

  const score = seriesScore.replaceAll(/(🦅|🐍)/g, "").trim();

  const startMs = new Date(firstMatch.startTime).getTime();
  const endMs = new Date(lastMatch.endTime).getTime();
  const totalMs = endMs - startMs;
  const totalMinutes = Math.floor(totalMs / 60000);
  const totalSeconds = Math.floor((totalMs % 60000) / 1000);
  const duration = `${totalMinutes.toLocaleString()}m ${totalSeconds.toLocaleString()}s`;

  return {
    score,
    duration,
    startTime: firstMatch.startTime,
    endTime: lastMatch.endTime,
  };
}
