import type { KothTimeline } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { KOTH_FULL_METER_TICKS } from "@guilty-spark/shared/halo/koth-capture-meter";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { TICK_FILL } from "../../chart-constants";
import { zeroScores } from "../../score-samples";
import { tileSegments } from "../../timeline-segments";
import type { KothHillData, TeamPercentShare, ScoreSample, ScoreScale, TimelineGanttSegment } from "../../types";

export const HILL_PROGRESS_SCALE: ScoreScale = {
  unit: "percent",
  progressionLabel: "Hill Progress",
  deltaLabel: "Hill Progress Delta",
};

const MIN_TRAILING_HILL_MS = 2_000;
const FULL_METER_PERCENT = 100;

interface HillMeter {
  readonly winnerTeamId: number | null;
  readonly ticksPerFullMeter: number;
}

// A captured hill's meter filled by definition however many of its ticks the film kept (the
// capture solver accepts 5–7 recorded ticks), so the winner's ticks at the capture are that
// hill's full meter; an uncaptured hill reads against the nominal meter.
function buildHillMeter(winnerTeamId: number | null, winnerTicks: number): HillMeter {
  return { winnerTeamId, ticksPerFullMeter: winnerTicks > 0 ? winnerTicks : KOTH_FULL_METER_TICKS };
}

// the winner's meter reaches 100 at the capture; anyone else is capped just below so a loser's
// run can never read as a capture
function toMeterPercent(ticks: number, teamId: number, meter: HillMeter): number {
  const cap = teamId === meter.winnerTeamId ? FULL_METER_PERCENT : FULL_METER_PERCENT - 1;
  return Math.min(cap, (ticks / meter.ticksPerFullMeter) * FULL_METER_PERCENT);
}

// an event may omit a team whose score is unchanged, so the running total is the team's last
// recorded value, not the last event's
function cumulativeTicksAt(events: KothTimeline["events"], key: string, timestampMs: number): number {
  return (
    events.findLast((event) => event.timestampMs <= timestampMs && key in event.runningScores)?.runningScores[key] ?? 0
  );
}

function ticksInHill(hillEvents: readonly ScoreSample[], baseline: Record<string, number>, key: string): number {
  const last = hillEvents.findLast((event) => key in event.runningScores);
  return last == null ? 0 : last.runningScores[key] - (baseline[key] ?? 0);
}

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

// Each hill is its own capture race: both teams' capture meters climb from zero until one team
// captures, then the meter resets for the next hill — mirroring oddball's per-round curves.
// runningScores are cumulative tick counts across the match, so each hill's ticks are measured
// against the totals standing when the hill spawned and read as a share of the meter.
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
    let hillEnd = cursor;
    while (hillEnd < events.length && events[hillEnd].timestampMs <= attributionEndMs) {
      hillEnd++;
    }
    const hillEvents = events.slice(cursor, hillEnd);
    const winnerTeamId = period.captureTs != null ? findCaptureWinnerTeamId(events, period.captureTs) : null;
    const meter = buildHillMeter(
      winnerTeamId,
      winnerTeamId == null ? 0 : ticksInHill(hillEvents, baseline, String(winnerTeamId)),
    );
    for (const event of hillEvents) {
      absorbEvent(event);
      const hillTicks: Record<string, number> = {};
      for (const teamId of teamIds) {
        const key = String(teamId);
        hillTicks[key] = toMeterPercent((cumulative[key] ?? 0) - (baseline[key] ?? 0), teamId, meter);
      }
      samples.push({ timestampMs: Math.min(event.timestampMs, durationMs), runningScores: hillTicks });
      hasEventSamples = true;
    }
    cursor = hillEnd;
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

function hillTicksBetween(events: KothTimeline["events"], teamId: number, startMs: number, endMs: number): number {
  const key = String(teamId);
  return cumulativeTicksAt(events, key, endMs) - cumulativeTicksAt(events, key, startMs);
}

function buildCaptureMeterPercentage(
  events: KothTimeline["events"],
  teamId: number,
  hillStartMs: number,
  hillEndMs: number,
  meter: HillMeter,
): number {
  if (teamId === meter.winnerTeamId) {
    return FULL_METER_PERCENT;
  }
  return Math.round(toMeterPercent(hillTicksBetween(events, teamId, hillStartMs, hillEndMs), teamId, meter));
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
    const attributionEndMs = period.captureTs ?? period.endMs;
    const meter = buildHillMeter(
      winnerTeamId,
      winnerTeamId == null ? 0 : hillTicksBetween(timeline.events, winnerTeamId, period.startMs, attributionEndMs),
    );
    const winnerColor = winnerTeamId != null ? (teamColorByTeamId.get(winnerTeamId) ?? null) : null;
    const winnerName = winnerTeamId != null ? getTeamName(winnerTeamId) : null;

    const teamCaptureProgress: TeamPercentShare[] = teamIds.map((teamId) => ({
      teamId,
      name: getTeamName(teamId),
      color: teamColorByTeamId.get(teamId) ?? TICK_FILL,
      percentage: buildCaptureMeterPercentage(timeline.events, teamId, period.startMs, attributionEndMs, meter),
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
