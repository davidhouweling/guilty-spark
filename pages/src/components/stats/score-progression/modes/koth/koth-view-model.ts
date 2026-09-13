import type { KothTimeline } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { TICK_FILL } from "../../chart-constants";
import { zeroScores } from "../../score-samples";
import { tileSegments } from "../../timeline-segments";
import type { KothHillData, KothHillTeamProgress, ScoreSample, TimelineGanttSegment } from "../../types";

const MIN_TRAILING_HILL_MS = 2_000;

// A capture timestamp is the capturing team's last score-event timestamp, so the co-timestamped
// event identifies the winner.
function findCaptureWinnerTeamId(events: KothTimeline["events"], captureTs: number): number | null {
  return events.findLast((event) => event.timestampMs === captureTs)?.teamId ?? null;
}

interface KothHillPeriod {
  readonly startMs: number;
  readonly endMs: number;
  readonly captureTs: number | null;
}

// The one derivation of hill windows both koth views share, so the gantt and the score lines
// always agree on how many hills the match had and where each one ends.
function buildKothHillPeriods(hillCaptureTimestamps: readonly number[], durationMs: number): KothHillPeriod[] {
  const periods: KothHillPeriod[] = [];
  let hillStart = 0;
  for (const captureTs of hillCaptureTimestamps) {
    // film-clock interpolation can land a capture slightly past the match duration; the hill is
    // real, so its end clamps to the axis while the raw timestamp still identifies the winner
    const endMs = Math.min(captureTs, durationMs);
    if (endMs <= hillStart) {
      continue;
    }
    periods.push({ startMs: hillStart, endMs, captureTs });
    hillStart = endMs;
  }
  // A match that ends on a capture leaves a sliver between the final capture and the film end;
  // that sliver is not a real hill, so only keep a trailing hill the teams actually contested.
  if (durationMs - hillStart >= MIN_TRAILING_HILL_MS) {
    periods.push({ startMs: hillStart, endMs: durationMs, captureTs: null });
  }
  return periods;
}

export interface KothScoreSeries {
  readonly samples: readonly ScoreSample[];
  readonly hillBoundaries: readonly number[];
}

// Each hill is its own capture race: both teams' scoring ticks climb from zero until one team
// captures, then the meter resets for the next hill — mirroring oddball's per-round curves.
// runningScores are cumulative across the match, so each hill's ticks are measured against the
// totals standing when the hill spawned.
export function buildKothScoreSeries(
  timeline: KothTimeline,
  teamIds: readonly number[],
  durationMs: number,
): KothScoreSeries {
  const samples: ScoreSample[] = [];
  const hillBoundaries: number[] = [];
  const keys = teamIds.map(String);
  const { events } = timeline;
  const cumulative: Record<string, number> = {};
  // an event may omit a team whose score is unchanged, so the running totals fold each event
  // into a carried snapshot instead of trusting any single record to be complete
  const absorbEvent = (event: ScoreSample): void => {
    for (const key of keys) {
      if (key in event.runningScores) {
        cumulative[key] = event.runningScores[key];
      }
    }
  };
  let cursor = 0;
  let hasEventSamples = false;

  for (const period of buildKothHillPeriods(timeline.hillCaptureTimestamps, durationMs)) {
    while (cursor < events.length && events[cursor].timestampMs < period.startMs) {
      absorbEvent(events[cursor]);
      cursor++;
    }
    const baseline = { ...cumulative };
    if (period.startMs > 0) {
      hillBoundaries.push(period.startMs);
    }
    samples.push({ timestampMs: period.startMs, runningScores: zeroScores(teamIds) });

    // the match-ending capture can interpolate slightly past the duration; its ticks are real,
    // so they land on the axis edge rather than being dropped
    const attributionEndMs = period.captureTs ?? period.endMs;
    while (cursor < events.length && events[cursor].timestampMs <= attributionEndMs) {
      absorbEvent(events[cursor]);
      const hillTicks: Record<string, number> = {};
      for (const key of keys) {
        hillTicks[key] = (cumulative[key] ?? 0) - (baseline[key] ?? 0);
      }
      samples.push({ timestampMs: Math.min(events[cursor].timestampMs, durationMs), runningScores: hillTicks });
      hasEventSamples = true;
      cursor++;
    }
  }

  // a series holding only the zero-reset seeds (every event past the duration) reconstructs
  // nothing — report it as unavailable rather than a flat zero chart
  if (!hasEventSamples) {
    return { samples: [], hillBoundaries: [] };
  }
  return { samples, hillBoundaries };
}

// One scoring-tick cadence: how far outside a control window a team's score event may sit while
// still counting as evidence the team really held the hill during that window.
const SEGMENT_EVENT_TOLERANCE_MS = 5_000;

// A control window straddling a capture boundary drags the previous hill's team into the new
// hill's bar (the hill has relocated — nobody is holding the old one). Only paint a segment in a
// team's colour when that team actually scored near it after this hill started.
function isSegmentCorroborated(
  events: KothTimeline["events"],
  teamId: number,
  hillStart: number,
  segmentStartMs: number,
  segmentEndMs: number,
): boolean {
  return events.some(
    (event) =>
      event.teamId === teamId &&
      event.timestampMs > hillStart &&
      event.timestampMs > segmentStartMs - SEGMENT_EVENT_TOLERANCE_MS &&
      event.timestampMs < segmentEndMs + SEGMENT_EVENT_TOLERANCE_MS,
  );
}

function buildHillSegments(
  hillStart: number,
  hillEnd: number,
  timeline: KothTimeline,
  teamColorByTeamId: Map<number, string>,
): TimelineGanttSegment[] {
  const overlapping = timeline.controlPeriods
    .filter((cp) => cp.endMs > hillStart && cp.startMs < hillEnd)
    .map((cp) => {
      const startMs = Math.max(cp.startMs, hillStart);
      const endMs = Math.min(cp.endMs, hillEnd);
      const teamId =
        cp.controllingTeamId != null &&
        isSegmentCorroborated(timeline.events, cp.controllingTeamId, hillStart, startMs, endMs)
          ? cp.controllingTeamId
          : null;
      return { startMs, endMs, teamId };
    });

  return tileSegments(hillStart, hillEnd, overlapping, teamColorByTeamId);
}

// The capture meter fills over 8 scoring ticks (~5s each, the 40s HCS meter) — mirrors the
// constants in api/services/halo/koth-capture-search.ts. The winner's meter completed by
// definition; a loser's meter is estimated from their scoring ticks inside the hill and capped
// below 100 so it can never read as a capture.
const METER_TICKS_PER_CAPTURE = 8;

function buildCaptureMeterPercentage(
  events: KothTimeline["events"],
  teamId: number,
  hillStartMs: number,
  hillEndMs: number,
  winnerTeamId: number | null,
): number {
  if (teamId === winnerTeamId) {
    return 100;
  }
  const key = String(teamId);
  const cumulativeAt = (timestampMs: number): number =>
    events.findLast((event) => event.timestampMs <= timestampMs)?.runningScores[key] ?? 0;
  const ticksInHill = cumulativeAt(hillEndMs) - cumulativeAt(hillStartMs);
  return Math.min(99, Math.round((ticksInHill / METER_TICKS_PER_CAPTURE) * 100));
}

export function buildKothHills(
  timeline: KothTimeline,
  teamIds: readonly number[],
  teamColorByTeamId: Map<number, string>,
  durationMs: number,
): KothHillData[] {
  return buildKothHillPeriods(timeline.hillCaptureTimestamps, durationMs).map((period, periodIndex) => {
    const segments = buildHillSegments(period.startMs, period.endMs, timeline, teamColorByTeamId);

    const winnerTeamId = period.captureTs != null ? findCaptureWinnerTeamId(timeline.events, period.captureTs) : null;
    const winnerColor = winnerTeamId != null ? (teamColorByTeamId.get(winnerTeamId) ?? null) : null;
    const winnerName = winnerTeamId != null ? getTeamName(winnerTeamId) : null;

    const teamCaptureProgress: KothHillTeamProgress[] = teamIds.map((teamId) => ({
      teamId,
      name: getTeamName(teamId),
      color: teamColorByTeamId.get(teamId) ?? TICK_FILL,
      percentage: buildCaptureMeterPercentage(
        timeline.events,
        teamId,
        period.startMs,
        period.captureTs ?? period.endMs,
        winnerTeamId,
      ),
    }));

    return {
      hillIndex: periodIndex + 1,
      startMs: period.startMs,
      endMs: period.endMs,
      segments,
      winnerTeamId,
      winnerColor,
      winnerName,
      teamCaptureProgress,
    };
  });
}
