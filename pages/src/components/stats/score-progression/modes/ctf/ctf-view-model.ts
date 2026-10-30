import type { CtfFlagRun, CtfFlagRunEvent, CtfTimeline } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { FLAG_ADVANTAGE_KEY, TICK_FILL } from "../../chart-constants";
import { interpolateSeriesAt, stepSeriesAt } from "../../interpolate-series";
import type {
  FlagAdvantageOverlay,
  FlagRunData,
  FlagRunLegendEntry,
  FlagRunMarkerData,
  FlagRunMarkerKind,
  FlagRunPoint,
  FlagRunsChartPoint,
  PlayerAdvantageData,
  ScoreProgressionPoint,
} from "../../types";

const FULL_PROGRESS = 100;

type RunDirection = 1 | -1;

// the first team's runs sit above the axis, matching the team order of the score charts
function runDirection(carrierTeamId: number, firstTeamId: number): RunDirection {
  return carrierTeamId === firstTeamId ? 1 : -1;
}

const SIDE_LABEL: Record<RunDirection, string> = { 1: "Above:", [-1]: "Below:" };

function toSignedPercent(progress: number, direction: RunDirection): number {
  const percent = Math.round(progress * FULL_PROGRESS);
  return percent === 0 ? 0 : percent * direction;
}

function orderedSamplesWithin(run: CtfFlagRun, endMs: number): Map<number, number> {
  const ordered = [...run.samples]
    .filter((sample) => sample.timestampMs > run.startMs && sample.timestampMs <= endMs)
    .sort((left, right) => left.timestampMs - right.timestampMs);
  return new Map(ordered.map((sample) => [sample.timestampMs, sample.progress]));
}

interface RunPoints {
  readonly points: FlagRunPoint[];
  readonly endProgress: number;
}

function buildRunPoints(run: CtfFlagRun, endMs: number, direction: RunDirection, captured: boolean): RunPoints {
  const points: FlagRunPoint[] = [{ timestampMs: run.startMs, progress: 0 }];
  for (const [timestampMs, progress] of orderedSamplesWithin(run, endMs)) {
    points.push({ timestampMs, progress: toSignedPercent(progress, direction) });
  }
  const last = Preconditions.checkExists(points.at(-1), "a run always has its start point");
  const endProgress = captured ? FULL_PROGRESS * direction : last.progress;
  if (last.timestampMs === endMs) {
    points[points.length - 1] = { timestampMs: endMs, progress: endProgress };
  } else {
    points.push({ timestampMs: endMs, progress: endProgress });
  }
  return { points, endProgress };
}

// film-clock skew can stamp an event or a run end a little outside the match or its run; anything
// further out is bad data
export const MATCH_SKEW_TOLERANCE_MS = 1_000;

const MARKER_KIND_BY_EVENT: Record<CtfFlagRunEvent["kind"], FlagRunMarkerKind> = {
  steal: "steal",
  grab: "grab",
  drop: "drop",
  return: "return",
  capture: "capture",
};

function buildRunMarkers(run: CtfFlagRun, points: readonly FlagRunPoint[], endMs: number): FlagRunMarkerData[] {
  const markers: FlagRunMarkerData[] = [];
  for (const event of run.events) {
    if (
      event.timestampMs < run.startMs - MATCH_SKEW_TOLERANCE_MS ||
      event.timestampMs > endMs + MATCH_SKEW_TOLERANCE_MS
    ) {
      continue;
    }
    const timestampMs = Math.min(Math.max(event.timestampMs, run.startMs), endMs);
    markers.push({
      timestampMs,
      progress: Math.round(interpolateSeriesAt(points, timestampMs, (point) => point.progress) ?? 0),
      kind: MARKER_KIND_BY_EVENT[event.kind],
    });
  }
  return markers;
}

// a run whose end lands beyond the match-end tolerance is drawn as cut off: its in-match portion
// stays, but the capture or return the film placed after the match is not depicted
function finishesWithinMatch(run: CtfFlagRun, durationMs: number): boolean {
  return run.outcome !== "matchEnd" && run.endMs <= durationMs + MATCH_SKEW_TOLERANCE_MS;
}

function buildRunReset(finished: boolean, endMs: number, endProgress: number): FlagRunData["reset"] {
  return finished ? { timestampMs: endMs, fromProgress: endProgress } : null;
}

export function isDrawableFlagRun(run: CtfFlagRun, durationMs: number): boolean {
  return run.carrierTeamId !== run.flagTeamId && run.startMs < durationMs && run.endMs > run.startMs;
}

export function buildFlagRuns(
  timeline: CtfTimeline,
  teamIds: readonly [number, number],
  teamColorByTeamId: ReadonlyMap<number, string>,
  durationMs: number,
): FlagRunData[] {
  const [firstTeamId] = teamIds;
  const runs: FlagRunData[] = [];
  const orderedRuns = [...timeline.runs].sort((left, right) => left.startMs - right.startMs);
  for (const run of orderedRuns) {
    const color = teamColorByTeamId.get(run.carrierTeamId);
    if (color == null || !teamIds.includes(run.flagTeamId) || !isDrawableFlagRun(run, durationMs)) {
      continue;
    }
    const direction = runDirection(run.carrierTeamId, firstTeamId);
    const endMs = Math.min(run.endMs, durationMs);
    const finished = finishesWithinMatch(run, durationMs);
    const { points, endProgress } = buildRunPoints(run, endMs, direction, finished && run.outcome === "capture");
    const runIndex = runs.length + 1;
    runs.push({
      runIndex,
      seriesKey: `run${String(runIndex)}`,
      seriesName: `${getTeamName(run.flagTeamId)} flag · ${getTeamName(run.carrierTeamId)} carrying`,
      color,
      points,
      markers: buildRunMarkers(run, points, endMs),
      reset: buildRunReset(finished, endMs, endProgress),
    });
  }
  return runs;
}

export function buildFlagRunLegend(
  teamIds: readonly [number, number],
  teamColorByTeamId: ReadonlyMap<number, string>,
): FlagRunLegendEntry[] {
  const [firstTeamId, secondTeamId] = teamIds;
  const entryFor = (flagTeamId: number, carrierTeamId: number): FlagRunLegendEntry => ({
    key: `flag-${String(flagTeamId)}`,
    color: teamColorByTeamId.get(carrierTeamId) ?? TICK_FILL,
    text: `${SIDE_LABEL[runDirection(carrierTeamId, firstTeamId)]} ${getTeamName(flagTeamId)}'s flag, carried by ${getTeamName(carrierTeamId)}`,
  });
  return [entryFor(secondTeamId, firstTeamId), entryFor(firstTeamId, secondTeamId)];
}

// one row per distinct instant so every series, the step-wise advantage included, shares the
// tooltip index
export function buildFlagRunsChartPoints(
  runs: readonly FlagRunData[],
  advantagePoints: readonly ScoreProgressionPoint[] | null = null,
): FlagRunsChartPoint[] {
  const runTimestamps = runs.flatMap((run) => run.points.map((point) => point.timestampMs));
  const advantageTimestamps = (advantagePoints ?? []).map((point) => point.timestampMs);
  const timestamps = [...new Set([...runTimestamps, ...advantageTimestamps])].sort((left, right) => left - right);
  return timestamps.map((timestampMs) => {
    const row: Record<string, number | null> = {};
    for (const run of runs) {
      row[run.seriesKey] = interpolateSeriesAt(run.points, timestampMs, (point) => point.progress);
    }
    if (advantagePoints != null) {
      row[FLAG_ADVANTAGE_KEY] = stepSeriesAt(advantagePoints, timestampMs, (point) => point.score);
    }
    return { ...row, timestampMs };
  });
}

// Recharts draws nothing over an empty data array, so a match without a single run is seeded
// with the home line's two endpoints and still shows its axes
export function buildFlagChartPoints(runs: readonly FlagRunData[], durationMs: number): FlagRunsChartPoint[] {
  return runs.length === 0 ? [{ timestampMs: 0 }, { timestampMs: durationMs }] : buildFlagRunsChartPoints(runs);
}

export function buildFlagAdvantageOverlay(
  runs: readonly FlagRunData[],
  advantage: PlayerAdvantageData | null,
): FlagAdvantageOverlay | null {
  if (advantage == null) {
    return null;
  }
  return {
    minScore: advantage.minScore,
    maxScore: advantage.maxScore,
    rows: buildFlagRunsChartPoints(runs, advantage.points),
  };
}
