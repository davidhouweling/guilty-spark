import type { KothTimeline } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { TICK_FILL } from "../../chart-constants";
import type { KothHillData, KothHillSegment, KothHillTeamProgress } from "../../types";

const MIN_TRAILING_HILL_MS = 2_000;

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

function mergeAdjacentSegments(segments: readonly KothHillSegment[]): KothHillSegment[] {
  const merged: KothHillSegment[] = [];
  for (const segment of segments) {
    const previous = merged.pop();
    if (previous == null) {
      merged.push(segment);
    } else if (previous.teamId === segment.teamId && previous.endMs === segment.startMs) {
      merged.push({ ...previous, endMs: segment.endMs });
    } else {
      merged.push(previous, segment);
    }
  }
  return merged;
}

function buildHillSegments(
  hillStart: number,
  hillEnd: number,
  timeline: KothTimeline,
  teamColorByTeamId: Map<number, string>,
): KothHillSegment[] {
  const overlapping = timeline.controlPeriods
    .filter((cp) => cp.endMs > hillStart && cp.startMs < hillEnd)
    .map((cp) => {
      const startMs = Math.max(cp.startMs, hillStart);
      const endMs = Math.min(cp.endMs, hillEnd);
      const controllingTeamId =
        cp.controllingTeamId != null &&
        isSegmentCorroborated(timeline.events, cp.controllingTeamId, hillStart, startMs, endMs)
          ? cp.controllingTeamId
          : null;
      return { startMs, endMs, controllingTeamId };
    })
    .sort((a, b) => a.startMs - b.startMs);

  const segments: KothHillSegment[] = [];
  let cursor = hillStart;

  for (const cp of overlapping) {
    if (cp.startMs > cursor) {
      segments.push({ startMs: cursor, endMs: cp.startMs, teamId: null, color: null });
    }
    segments.push({
      startMs: cp.startMs,
      endMs: cp.endMs,
      teamId: cp.controllingTeamId,
      color: cp.controllingTeamId != null ? (teamColorByTeamId.get(cp.controllingTeamId) ?? null) : null,
    });
    cursor = cp.endMs;
  }

  if (cursor < hillEnd) {
    segments.push({ startMs: cursor, endMs: hillEnd, teamId: null, color: null });
  }

  return mergeAdjacentSegments(segments);
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
  const { hillCaptureTimestamps } = timeline;

  interface HillPeriod {
    startMs: number;
    endMs: number;
    isCaptured: boolean;
  }

  const hillPeriods: HillPeriod[] = [];
  let hillStart = 0;
  for (const captureTs of hillCaptureTimestamps) {
    hillPeriods.push({ startMs: hillStart, endMs: captureTs, isCaptured: true });
    hillStart = captureTs;
  }
  // A match that ends on a capture leaves a sliver between the final capture and the film end;
  // that sliver is not a real hill, so only keep a trailing hill the teams actually contested.
  if (durationMs - hillStart >= MIN_TRAILING_HILL_MS) {
    hillPeriods.push({ startMs: hillStart, endMs: durationMs, isCaptured: false });
  }

  return hillPeriods.map((period, periodIndex) => {
    const segments = buildHillSegments(period.startMs, period.endMs, timeline, teamColorByTeamId);

    // hillCaptureTimestamps entries are the capturing team's last score-event timestamp,
    // so the event at period.endMs directly identifies the winner.
    const capturingEvent = period.isCaptured ? timeline.events.findLast((e) => e.timestampMs === period.endMs) : null;
    const winnerTeamId = capturingEvent?.teamId ?? null;
    const winnerColor = winnerTeamId != null ? (teamColorByTeamId.get(winnerTeamId) ?? null) : null;
    const winnerName = winnerTeamId != null ? getTeamName(winnerTeamId) : null;

    const teamCaptureProgress: KothHillTeamProgress[] = teamIds.map((teamId) => ({
      teamId,
      name: getTeamName(teamId),
      color: teamColorByTeamId.get(teamId) ?? TICK_FILL,
      percentage: buildCaptureMeterPercentage(timeline.events, teamId, period.startMs, period.endMs, winnerTeamId),
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
