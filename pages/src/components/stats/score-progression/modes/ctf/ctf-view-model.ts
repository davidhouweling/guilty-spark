import type { CtfFlagRun, CtfTimeline } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { TICK_FILL } from "../../chart-constants";
import { interpolateSeriesAt } from "../../interpolate-series";
import type { FlagRunData, FlagRunLegendEntry, FlagRunMarkerData, FlagRunPoint, FlagRunsChartPoint } from "../../types";

const FULL_PROGRESS = 100;

type RunDirection = 1 | -1;

function toSignedPercent(progress: number, direction: RunDirection): number {
  return Math.round(progress * FULL_PROGRESS) * direction;
}

export function progressAt(points: readonly FlagRunPoint[], timestampMs: number): number | null {
  return interpolateSeriesAt(points, timestampMs, (point) => point.progress);
}

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
  const last = Preconditions.checkExists(points.at(-1), "a run always has its start point");
  const endProgress = run.outcome === "capture" ? FULL_PROGRESS * direction : last.progress;
  if (last.timestampMs === endMs) {
    points[points.length - 1] = { timestampMs: endMs, progress: endProgress };
  } else {
    points.push({ timestampMs: endMs, progress: endProgress });
  }
  return points;
}

// an event stamped past the axis (a film clock can place the final capture a few ms after the
// match duration) is clamped onto it rather than lost
function buildRunMarkers(run: CtfFlagRun, points: readonly FlagRunPoint[], endMs: number): FlagRunMarkerData[] {
  const markers: FlagRunMarkerData[] = [];
  for (const event of run.events) {
    if (event.timestampMs < run.startMs) {
      continue;
    }
    const timestampMs = Math.min(event.timestampMs, endMs);
    markers.push({ timestampMs, progress: Math.round(progressAt(points, timestampMs) ?? 0), kind: event.kind });
  }
  return markers;
}

function buildRunReset(run: CtfFlagRun, points: readonly FlagRunPoint[], endMs: number): FlagRunData["reset"] {
  if (run.outcome === "matchEnd") {
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

// one forward pass per run over the sorted timestamps; the cursor only ever advances
function fillRunColumn(rows: Record<string, number | null>[], timestamps: readonly number[], run: FlagRunData): void {
  const { points } = run;
  let cursor = 0;
  for (const [index, timestampMs] of timestamps.entries()) {
    const row = Preconditions.checkExists(rows[index]);
    if (points.length === 0) {
      row[run.seriesKey] = null;
      continue;
    }
    while (cursor < points.length - 1 && points[cursor].timestampMs < timestampMs) {
      cursor += 1;
    }
    const upper = points[cursor];
    const lower = cursor > 0 ? points[cursor - 1] : upper;
    if (timestampMs < lower.timestampMs || timestampMs > upper.timestampMs) {
      row[run.seriesKey] = null;
      continue;
    }
    row[run.seriesKey] = interpolateSeriesAt([lower, upper], timestampMs, (point) => point.progress);
  }
}

export function buildFlagRunsChartPoints(runs: readonly FlagRunData[]): FlagRunsChartPoint[] {
  const timestamps = [...new Set(runs.flatMap((run) => run.points.map((point) => point.timestampMs)))].sort(
    (left, right) => left - right,
  );
  const rows: Record<string, number | null>[] = timestamps.map(() => ({}));
  for (const run of runs) {
    fillRunColumn(rows, timestamps, run);
  }
  return rows.map((row, index) => ({ ...row, timestampMs: Preconditions.checkExists(timestamps[index]) }));
}
