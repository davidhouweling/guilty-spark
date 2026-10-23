import type { CtfFlagRun, CtfTimeline } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import type { FlagRunData, FlagRunLegendEntry, FlagRunMarkerData, FlagRunPoint } from "../../types";

const FULL_PROGRESS = 100;

type RunDirection = 1 | -1;

function toSignedPercent(progress: number, direction: RunDirection): number {
  return Math.round(progress * FULL_PROGRESS) * direction;
}

// the flag sits where it was last seen until the next sample moves it
function progressAt(points: readonly FlagRunPoint[], timestampMs: number): number {
  let latest: FlagRunPoint | undefined;
  for (const point of points) {
    if (point.timestampMs > timestampMs) {
      break;
    }
    latest = point;
  }
  return latest?.progress ?? 0;
}

function buildRunPoints(run: CtfFlagRun, endMs: number, direction: RunDirection): FlagRunPoint[] {
  const points: FlagRunPoint[] = [{ timestampMs: run.startMs, progress: 0 }];
  for (const sample of run.samples) {
    if (sample.timestampMs > run.startMs && sample.timestampMs < endMs) {
      points.push({ timestampMs: sample.timestampMs, progress: toSignedPercent(sample.progress, direction) });
    }
  }
  const lastProgress = points.at(-1)?.progress ?? 0;
  const endProgress = run.outcome === "capture" && endMs === run.endMs ? FULL_PROGRESS * direction : lastProgress;
  points.push({ timestampMs: endMs, progress: endProgress });
  return points;
}

function buildRunMarkers(run: CtfFlagRun, points: readonly FlagRunPoint[], endMs: number): FlagRunMarkerData[] {
  const markers: FlagRunMarkerData[] = [];
  for (const event of run.events) {
    if (event.timestampMs > endMs) {
      continue;
    }
    markers.push({ timestampMs: event.timestampMs, progress: progressAt(points, event.timestampMs), kind: event.kind });
  }
  return markers;
}

// a run that ends with the flag going home draws a reset back to the home line; a run cut off
// by the match end does not
function buildRunReset(run: CtfFlagRun, points: readonly FlagRunPoint[], endMs: number): FlagRunData["reset"] {
  if (run.outcome === "matchEnd" || endMs < run.endMs) {
    return null;
  }
  return { timestampMs: endMs, fromProgress: points.at(-1)?.progress ?? 0 };
}

export function buildFlagRuns(
  timeline: CtfTimeline,
  teamIds: readonly number[],
  teamColorByTeamId: ReadonlyMap<number, string>,
  durationMs: number,
): FlagRunData[] {
  if (teamIds.length !== 2) {
    return [];
  }
  const [firstTeamId] = teamIds;
  const runs: FlagRunData[] = [];
  for (const run of timeline.runs) {
    const color = teamColorByTeamId.get(run.carrierTeamId);
    if (color == null || !teamIds.includes(run.flagTeamId) || run.startMs >= durationMs || run.endMs <= run.startMs) {
      continue;
    }
    const direction: RunDirection = run.flagTeamId === firstTeamId ? 1 : -1;
    const endMs = Math.min(run.endMs, durationMs);
    const points = buildRunPoints(run, endMs, direction);
    runs.push({
      runIndex: runs.length + 1,
      seriesName: `${getTeamName(run.flagTeamId)} flag · ${getTeamName(run.carrierTeamId)} carrying`,
      color,
      outcome: run.outcome,
      points,
      markers: buildRunMarkers(run, points, endMs),
      reset: buildRunReset(run, points, endMs),
    });
  }
  return runs;
}

export function buildFlagRunLegend(
  teamIds: readonly number[],
  teamColorByTeamId: ReadonlyMap<number, string>,
): FlagRunLegendEntry[] {
  if (teamIds.length !== 2) {
    return [];
  }
  const [firstTeamId, secondTeamId] = teamIds;
  const entryFor = (flagTeamId: number, carrierTeamId: number, side: string): FlagRunLegendEntry => ({
    key: `flag-${String(flagTeamId)}`,
    color: teamColorByTeamId.get(carrierTeamId) ?? "",
    text: `${side} ${getTeamName(flagTeamId)}'s flag, carried by ${getTeamName(carrierTeamId)}`,
  });
  return [entryFor(firstTeamId, secondTeamId, "Above:"), entryFor(secondTeamId, firstTeamId, "Below:")];
}
