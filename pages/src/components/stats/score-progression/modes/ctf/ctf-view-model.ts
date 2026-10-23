import type { CtfFlagRun, CtfTimeline } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { TICK_FILL } from "../../chart-constants";
import type { FlagRunData, FlagRunLegendEntry, FlagRunMarkerData, FlagRunPoint, FlagRunsChartPoint } from "../../types";

const FULL_PROGRESS = 100;

type RunDirection = 1 | -1;

function toSignedPercent(progress: number, direction: RunDirection): number {
  return Math.round(progress * FULL_PROGRESS) * direction;
}

// the drawn line is linear between points, so a position between two points is interpolated
export function progressAt(points: readonly FlagRunPoint[], timestampMs: number): number | null {
  const first = points.at(0);
  const last = points.at(-1);
  if (first == null || last == null || timestampMs < first.timestampMs || timestampMs > last.timestampMs) {
    return null;
  }
  let previous = first;
  for (const point of points) {
    if (point.timestampMs >= timestampMs) {
      const span = point.timestampMs - previous.timestampMs;
      if (span === 0) {
        return point.progress;
      }
      return previous.progress + ((point.progress - previous.progress) * (timestampMs - previous.timestampMs)) / span;
    }
    previous = point;
  }
  return last.progress;
}

// samples are ordered and deduped by timestamp (the last one wins) so the line never doubles
// back and every timestamp maps to one progress
function orderedSamplesWithin(run: CtfFlagRun, endMs: number): Map<number, number> {
  const ordered = [...run.samples]
    .filter((sample) => sample.timestampMs > run.startMs && sample.timestampMs <= endMs)
    .sort((left, right) => left.timestampMs - right.timestampMs);
  return new Map(ordered.map((sample) => [sample.timestampMs, sample.progress]));
}

function buildRunPoints(run: CtfFlagRun, endMs: number, direction: RunDirection): FlagRunPoint[] {
  const points: FlagRunPoint[] = [{ timestampMs: run.startMs, progress: 0 }];
  for (const [timestampMs, progress] of orderedSamplesWithin(run, endMs)) {
    points.push({ timestampMs, progress: toSignedPercent(progress, direction) });
  }
  const last = points.at(-1) ?? { timestampMs: run.startMs, progress: 0 };
  const endProgress = run.outcome === "capture" && endMs === run.endMs ? FULL_PROGRESS * direction : last.progress;
  if (last.timestampMs === endMs) {
    points[points.length - 1] = { timestampMs: endMs, progress: endProgress };
  } else {
    points.push({ timestampMs: endMs, progress: endProgress });
  }
  return points;
}

function buildRunMarkers(run: CtfFlagRun, points: readonly FlagRunPoint[], endMs: number): FlagRunMarkerData[] {
  const markers: FlagRunMarkerData[] = [];
  for (const event of run.events) {
    if (event.timestampMs < run.startMs || event.timestampMs > endMs) {
      continue;
    }
    markers.push({
      timestampMs: event.timestampMs,
      progress: Math.round(progressAt(points, event.timestampMs) ?? 0),
      kind: event.kind,
    });
  }
  return markers;
}

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
    if (
      color == null ||
      !teamIds.includes(run.flagTeamId) ||
      run.carrierTeamId === run.flagTeamId ||
      run.startMs >= durationMs ||
      run.endMs <= run.startMs
    ) {
      continue;
    }
    const direction: RunDirection = run.flagTeamId === firstTeamId ? 1 : -1;
    const endMs = Math.min(run.endMs, durationMs);
    const points = buildRunPoints(run, endMs, direction);
    const runIndex = runs.length + 1;
    runs.push({
      runIndex,
      seriesKey: `run${String(runIndex)}`,
      seriesName: `${getTeamName(run.flagTeamId)} flag · ${getTeamName(run.carrierTeamId)} carrying`,
      color,
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
    color: teamColorByTeamId.get(carrierTeamId) ?? TICK_FILL,
    text: `${side} ${getTeamName(flagTeamId)}'s flag, carried by ${getTeamName(carrierTeamId)}`,
  });
  return [entryFor(firstTeamId, secondTeamId, "Above:"), entryFor(secondTeamId, firstTeamId, "Below:")];
}

// every run shares one time axis; a run contributes its interpolated progress inside its span
// and null outside it
export function buildFlagRunsChartPoints(runs: readonly FlagRunData[]): FlagRunsChartPoint[] {
  const timestamps = [...new Set(runs.flatMap((run) => run.points.map((point) => point.timestampMs)))].sort(
    (left, right) => left - right,
  );
  return timestamps.map((timestampMs) => {
    const row: Record<string, number | null> = {};
    for (const run of runs) {
      row[run.seriesKey] = progressAt(run.points, timestampMs);
    }
    return { ...row, timestampMs };
  });
}
