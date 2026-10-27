import type { KothTimeline } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { KOTH_FULL_METER_TICKS } from "@guilty-spark/shared/halo/koth-capture-meter";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { TICK_FILL } from "../../chart-constants";
import { carryScoresForward, zeroScores } from "../../score-samples";
import { tileSegments } from "../../timeline-segments";
import type { KothHillData, TeamPercentShare, ScoreSample, TimelineGanttSegment } from "../../types";

type KothScoreEvent = KothTimeline["events"][number];

const MIN_TRAILING_HILL_MS = 2_000;
const FULL_METER_PERCENT = 100;

export interface KothHillMeter {
  readonly winnerTeamId: number | null;
  readonly ticksPerFullMeter: number;
}

function toMeterPercent(ticks: number, teamId: number, meter: KothHillMeter): number {
  const cap = teamId === meter.winnerTeamId ? FULL_METER_PERCENT : FULL_METER_PERCENT - 1;
  return Math.min(cap, (ticks / meter.ticksPerFullMeter) * FULL_METER_PERCENT);
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
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

export interface KothHillEvent {
  readonly timestampMs: number;
  readonly teamId: number;
  readonly ticksByTeam: Record<string, number>;
}

export interface KothHillWindow extends KothHillPeriod {
  readonly events: readonly KothHillEvent[];
  readonly hillTicks: Record<string, number>;
  readonly meter: KothHillMeter;
}

interface ScannedHill extends KothHillPeriod {
  readonly events: readonly KothHillEvent[];
  readonly hillTicks: Record<string, number>;
  readonly winnerTeamId: number | null;
  readonly winnerTicks: number;
}

function ticksSince(
  cumulative: Record<string, number>,
  baseline: Record<string, number>,
  keys: readonly string[],
): Record<string, number> {
  return Object.fromEntries(keys.map((key) => [key, (cumulative[key] ?? 0) - (baseline[key] ?? 0)]));
}

// A capture timestamp is the capturing team's last score-event timestamp, so the co-timestamped
// event identifies the winner.
function findCaptureWinnerTeamId(events: readonly KothHillEvent[], captureTs: number): number | null {
  return events.findLast((event) => event.timestampMs === captureTs)?.teamId ?? null;
}

interface HillScan {
  readonly events: KothHillEvent[];
  readonly nextIndex: number;
}

function scanHillEvents(
  events: readonly KothScoreEvent[],
  fromIndex: number,
  untilMs: number,
  cumulative: Record<string, number>,
  keys: readonly string[],
): HillScan {
  const baseline = { ...cumulative };
  const hillEvents: KothHillEvent[] = [];
  let index = fromIndex;
  while (index < events.length && events[index].timestampMs <= untilMs) {
    const event = events[index];
    carryScoresForward(cumulative, event, keys);
    hillEvents.push({
      timestampMs: event.timestampMs,
      teamId: event.teamId,
      ticksByTeam: ticksSince(cumulative, baseline, keys),
    });
    index++;
  }
  return { events: hillEvents, nextIndex: index };
}

function scanHills(timeline: KothTimeline, teamIds: readonly number[], durationMs: number): ScannedHill[] {
  const keys = teamIds.map(String);
  const { events } = timeline;
  const cumulative: Record<string, number> = {};
  const hills: ScannedHill[] = [];
  let cursor = 0;

  for (const period of buildKothHillPeriods(timeline.hillCaptureTimestamps, durationMs)) {
    while (cursor < events.length && events[cursor].timestampMs < period.startMs) {
      carryScoresForward(cumulative, events[cursor], keys);
      cursor++;
    }
    // the match-ending capture can interpolate slightly past the duration; its ticks are real,
    // so they belong to the hill rather than being dropped
    const scan = scanHillEvents(events, cursor, period.captureTs ?? period.endMs, cumulative, keys);
    cursor = scan.nextIndex;
    const hillTicks = scan.events.at(-1)?.ticksByTeam ?? zeroScores(teamIds);
    const winnerTeamId = period.captureTs != null ? findCaptureWinnerTeamId(scan.events, period.captureTs) : null;
    const winnerTicks = winnerTeamId == null ? 0 : (hillTicks[String(winnerTeamId)] ?? 0);
    hills.push({ ...period, events: scan.events, hillTicks, winnerTeamId, winnerTicks });
  }
  return hills;
}

// A captured hill's meter filled by definition however many of its ticks the film kept (the
// capture solver accepts as few as 5 recorded ticks, and more than the nominal 8 can be
// recorded), so the winner's ticks at the capture are that hill's full meter. A hill without
// one reads against the match's typical capture, or the nominal meter when nothing was captured.
export function buildKothHillWindows(
  timeline: KothTimeline,
  teamIds: readonly number[],
  durationMs: number,
): KothHillWindow[] {
  const hills = scanHills(timeline, teamIds, durationMs);
  const typicalCaptureTicks =
    median(hills.filter((hill) => hill.winnerTicks > 0).map((hill) => hill.winnerTicks)) ?? KOTH_FULL_METER_TICKS;
  return hills.map(({ winnerTeamId, winnerTicks, ...hill }) => ({
    ...hill,
    meter: { winnerTeamId, ticksPerFullMeter: winnerTicks > 0 ? winnerTicks : typicalCaptureTicks },
  }));
}

export interface KothScoreSeries {
  readonly samples: readonly ScoreSample[];
  readonly hillBoundaries: readonly number[];
}

function toMeterPercents(
  ticksByTeam: Record<string, number>,
  teamIds: readonly number[],
  meter: KothHillMeter,
): Record<string, number> {
  return Object.fromEntries(
    teamIds.map((teamId) => [String(teamId), toMeterPercent(ticksByTeam[String(teamId)] ?? 0, teamId, meter)]),
  );
}

// Each hill is its own capture race: both teams' meters climb from zero until one team captures,
// then the meter resets for the next hill — mirroring oddball's per-round curves.
export function buildKothScoreSeries(
  hillWindows: readonly KothHillWindow[],
  teamIds: readonly number[],
  durationMs: number,
): KothScoreSeries {
  const samples: ScoreSample[] = [];
  const hillBoundaries: number[] = [];

  for (const hillWindow of hillWindows) {
    if (hillWindow.startMs > 0) {
      hillBoundaries.push(hillWindow.startMs);
    }
    samples.push({ timestampMs: hillWindow.startMs, runningScores: zeroScores(teamIds) });
    for (const event of hillWindow.events) {
      samples.push({
        timestampMs: Math.min(event.timestampMs, durationMs),
        runningScores: toMeterPercents(event.ticksByTeam, teamIds, hillWindow.meter),
      });
    }
  }

  // a series holding only the zero-reset seeds (every event past the duration) reconstructs
  // nothing — report it as unavailable rather than a flat zero chart
  if (hillWindows.every((hillWindow) => hillWindow.events.length === 0)) {
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

function buildCaptureMeterPercentage(hillWindow: KothHillWindow, teamId: number): number {
  if (teamId === hillWindow.meter.winnerTeamId) {
    return FULL_METER_PERCENT;
  }
  return Math.round(toMeterPercent(hillWindow.hillTicks[String(teamId)] ?? 0, teamId, hillWindow.meter));
}

export function buildKothHills(
  timeline: KothTimeline,
  hillWindows: readonly KothHillWindow[],
  teamIds: readonly number[],
  teamColorByTeamId: Map<number, string>,
): KothHillData[] {
  return hillWindows.map((hillWindow, periodIndex) => {
    const segments = buildHillSegments(hillWindow.startMs, hillWindow.endMs, timeline, teamColorByTeamId);
    const { winnerTeamId } = hillWindow.meter;
    const winnerColor = winnerTeamId != null ? (teamColorByTeamId.get(winnerTeamId) ?? null) : null;
    const winnerName = winnerTeamId != null ? getTeamName(winnerTeamId) : null;

    const teamCaptureProgress: TeamPercentShare[] = teamIds.map((teamId) => ({
      teamId,
      name: getTeamName(teamId),
      color: teamColorByTeamId.get(teamId) ?? TICK_FILL,
      percentage: buildCaptureMeterPercentage(hillWindow, teamId),
    }));

    return {
      hillIndex: periodIndex + 1,
      startMs: hillWindow.startMs,
      endMs: hillWindow.endMs,
      segments,
      winnerTeamId,
      winnerColor,
      winnerName,
      teamCaptureProgress,
    };
  });
}
