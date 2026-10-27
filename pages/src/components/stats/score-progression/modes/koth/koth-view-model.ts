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

function toMeterPercent(ticks: number, teamId: number, meter: HillMeter): number {
  const cap = teamId === meter.winnerTeamId ? FULL_METER_PERCENT : FULL_METER_PERCENT - 1;
  return Math.min(cap, (ticks / meter.ticksPerFullMeter) * FULL_METER_PERCENT);
}

function absorbScores(cumulative: Record<string, number>, event: ScoreSample, keys: readonly string[]): void {
  for (const key of keys) {
    if (key in event.runningScores) {
      cumulative[key] = event.runningScores[key];
    }
  }
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

interface KothHillWindow extends KothHillPeriod {
  readonly baseline: Record<string, number>;
  readonly hillEvents: readonly ScoreSample[];
  readonly meter: HillMeter;
}

// One forward pass attributes every score event to its hill, so the gantt and the score lines
// read the same ticks against the same meter. runningScores are cumulative tick counts across the
// match, so a hill's ticks are measured against the totals standing when it spawned.
function buildKothHillWindows(
  timeline: KothTimeline,
  teamIds: readonly number[],
  durationMs: number,
): KothHillWindow[] {
  const keys = teamIds.map(String);
  const { events } = timeline;
  const cumulative: Record<string, number> = {};
  const windows: KothHillWindow[] = [];
  let cursor = 0;

  for (const period of buildKothHillPeriods(timeline.hillCaptureTimestamps, durationMs)) {
    while (cursor < events.length && events[cursor].timestampMs < period.startMs) {
      absorbScores(cumulative, events[cursor], keys);
      cursor++;
    }
    const baseline = { ...cumulative };
    // the match-ending capture can interpolate slightly past the duration; its ticks are real,
    // so they belong to the hill rather than being dropped
    const attributionEndMs = period.captureTs ?? period.endMs;
    let hillEnd = cursor;
    while (hillEnd < events.length && events[hillEnd].timestampMs <= attributionEndMs) {
      hillEnd++;
    }
    const hillEvents = events.slice(cursor, hillEnd);
    for (const event of hillEvents) {
      absorbScores(cumulative, event, keys);
    }
    cursor = hillEnd;
    const winnerTeamId = period.captureTs != null ? findCaptureWinnerTeamId(events, period.captureTs) : null;
    const meter = buildHillMeter(
      winnerTeamId,
      winnerTeamId == null ? 0 : ticksInHill(hillEvents, baseline, String(winnerTeamId)),
    );
    windows.push({ ...period, baseline, hillEvents, meter });
  }
  return windows;
}

export interface KothScoreSeries {
  readonly samples: readonly ScoreSample[];
  readonly hillBoundaries: readonly number[];
}

// Each hill is its own capture race: both teams' meters climb from zero until one team captures,
// then the meter resets for the next hill — mirroring oddball's per-round curves.
export function buildKothScoreSeries(
  timeline: KothTimeline,
  teamIds: readonly number[],
  durationMs: number,
): KothScoreSeries {
  const samples: ScoreSample[] = [];
  const hillBoundaries: number[] = [];
  const keys = teamIds.map(String);
  let hasEventSamples = false;

  for (const window of buildKothHillWindows(timeline, teamIds, durationMs)) {
    if (window.startMs > 0) {
      hillBoundaries.push(window.startMs);
    }
    samples.push({ timestampMs: window.startMs, runningScores: zeroScores(teamIds) });
    const cumulative = { ...window.baseline };
    for (const event of window.hillEvents) {
      absorbScores(cumulative, event, keys);
      const meterPercents: Record<string, number> = {};
      for (const teamId of teamIds) {
        const key = String(teamId);
        meterPercents[key] = toMeterPercent((cumulative[key] ?? 0) - (window.baseline[key] ?? 0), teamId, window.meter);
      }
      samples.push({ timestampMs: Math.min(event.timestampMs, durationMs), runningScores: meterPercents });
      hasEventSamples = true;
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

// the winner's meter completed by definition; anyone else reads their ticks against it
function buildCaptureMeterPercentage(window: KothHillWindow, teamId: number): number {
  if (teamId === window.meter.winnerTeamId) {
    return FULL_METER_PERCENT;
  }
  const ticks = ticksInHill(window.hillEvents, window.baseline, String(teamId));
  return Math.round(toMeterPercent(ticks, teamId, window.meter));
}

export function buildKothHills(
  timeline: KothTimeline,
  teamIds: readonly number[],
  teamColorByTeamId: Map<number, string>,
  durationMs: number,
): KothHillData[] {
  return buildKothHillWindows(timeline, teamIds, durationMs).map((window, periodIndex) => {
    const segments = buildHillSegments(window.startMs, window.endMs, timeline, teamColorByTeamId);
    const { winnerTeamId } = window.meter;
    const winnerColor = winnerTeamId != null ? (teamColorByTeamId.get(winnerTeamId) ?? null) : null;
    const winnerName = winnerTeamId != null ? getTeamName(winnerTeamId) : null;

    const teamCaptureProgress: TeamPercentShare[] = teamIds.map((teamId) => ({
      teamId,
      name: getTeamName(teamId),
      color: teamColorByTeamId.get(teamId) ?? TICK_FILL,
      percentage: buildCaptureMeterPercentage(window, teamId),
    }));

    return {
      hillIndex: periodIndex + 1,
      startMs: window.startMs,
      endMs: window.endMs,
      segments,
      winnerTeamId,
      winnerColor,
      winnerName,
      teamCaptureProgress,
    };
  });
}
