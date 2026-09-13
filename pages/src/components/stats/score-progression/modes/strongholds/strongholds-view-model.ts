import type {
  StrongholdsZoneCountSample,
  StrongholdsZoneEvent,
} from "@guilty-spark/shared/contracts/stats/match-analytics";
import { extendToDuration } from "../../extend-to-duration";
import { tileSegments } from "../../timeline-segments";
import type { OccupiedInterval } from "../../timeline-segments";
import type {
  PlayerAdvantageData,
  ScoreMarkerData,
  ScoreProgressionPoint,
  ScoreProgressionTeamLine,
  TimelineGanttSegment,
  ZoneStripData,
  ZoneStripTeamShare,
} from "../../types";

// Every ranked strongholds map plays three zones, so the advantage axis is fixed at ±3.
const ZONE_ADVANTAGE_DOMAIN = 3;

// Scoring is continuous, so a marker between two line points sits on the linear interpolation.
function sampleLineAt(points: readonly ScoreProgressionPoint[], timestampMs: number): number {
  let previous: ScoreProgressionPoint | null = null;
  for (const point of points) {
    if (point.timestampMs >= timestampMs) {
      if (previous == null || point.timestampMs === previous.timestampMs) {
        return point.score;
      }
      const span = point.timestampMs - previous.timestampMs;
      return previous.score + ((point.score - previous.score) * (timestampMs - previous.timestampMs)) / span;
    }
    previous = point;
  }
  return previous?.score ?? 0;
}

export function buildStrongholdsMarkers(
  zoneEvents: readonly StrongholdsZoneEvent[],
  teamLines: readonly ScoreProgressionTeamLine[],
  durationMs: number,
): ScoreMarkerData[] {
  const lineByTeamId = new Map(teamLines.map((line) => [line.teamId, line]));
  const markers: ScoreMarkerData[] = [];
  for (const zoneEvent of zoneEvents) {
    const line = lineByTeamId.get(zoneEvent.teamId);
    if (line == null || zoneEvent.timestampMs > durationMs) {
      continue;
    }
    markers.push({
      timestampMs: zoneEvent.timestampMs,
      score: sampleLineAt(line.points, zoneEvent.timestampMs),
      teamId: zoneEvent.teamId,
      teamName: line.name,
      color: line.color,
      kind: zoneEvent.kind,
    });
  }
  return markers;
}

// The strip encodes the leader's grip as segment opacity: a 3-cap paints the full team colour,
// a 2-zone hold a dimmer one, a single zone dimmer still, and a tie stays neutral.
const ZONE_LEAD_OPACITY: readonly number[] = [0, 0.4, 0.7, 1];

interface ZoneCountWindow {
  readonly startMs: number;
  readonly endMs: number;
  readonly count0: number;
  readonly count1: number;
}

// Zone ownership is a step function, so each sample's counts hold until the next sample.
function buildZoneCountWindows(
  zoneTimeline: readonly StrongholdsZoneCountSample[],
  teamIds: readonly number[],
  durationMs: number,
): ZoneCountWindow[] | null {
  if (teamIds.length !== 2) {
    return null;
  }
  const [teamId0, teamId1] = teamIds;
  const key0 = String(teamId0);
  const key1 = String(teamId1);
  const inMatchSamples = zoneTimeline
    .filter((sample) => sample.timestampMs <= durationMs)
    .sort((a, b) => a.timestampMs - b.timestampMs);
  if (inMatchSamples.length === 0) {
    return null;
  }
  return inMatchSamples.map((sample, sampleIndex) => ({
    startMs: sample.timestampMs,
    endMs: inMatchSamples[sampleIndex + 1]?.timestampMs ?? durationMs,
    count0: sample.zoneCounts[key0] ?? 0,
    count1: sample.zoneCounts[key1] ?? 0,
  }));
}

function buildZoneStripShares(
  segments: readonly TimelineGanttSegment[],
  teamLines: readonly ScoreProgressionTeamLine[],
  durationMs: number,
): ZoneStripTeamShare[] {
  return teamLines.map((line) => {
    const leadMs = segments
      .filter((segment) => segment.teamId === line.teamId)
      .reduce((total, segment) => total + (segment.endMs - segment.startMs), 0);
    return {
      teamId: line.teamId,
      name: line.name,
      color: line.color,
      // a lead too brief to round to 1% still counts as time spent ahead
      leadPercentage: leadMs > 0 ? Math.max(1, Math.round((leadMs / durationMs) * 100)) : 0,
    };
  });
}

// One gantt strip coloured by whoever holds more zones at each moment; ties stay neutral. A match
// where the counts never diverge has no strip, matching the zone-advantage behaviour.
export function buildZoneControlStrip(
  zoneTimeline: readonly StrongholdsZoneCountSample[],
  teamLines: readonly ScoreProgressionTeamLine[],
  durationMs: number,
): ZoneStripData | null {
  if (durationMs <= 0) {
    return null;
  }
  const windows = buildZoneCountWindows(
    zoneTimeline,
    teamLines.map((line) => line.teamId),
    durationMs,
  );
  if (windows == null) {
    return null;
  }
  const [line0, line1] = teamLines;

  const intervals: OccupiedInterval[] = [];
  for (const window of windows) {
    if (window.count0 === window.count1) {
      continue;
    }
    const leader = window.count0 > window.count1 ? line0 : line1;
    intervals.push({
      startMs: window.startMs,
      endMs: window.endMs,
      teamId: leader.teamId,
      opacity: ZONE_LEAD_OPACITY[Math.min(Math.max(window.count0, window.count1), 3)],
    });
  }
  if (intervals.length === 0) {
    return null;
  }

  const teamColorByTeamId = new Map(teamLines.map((line) => [line.teamId, line.color]));
  const segments = tileSegments(0, durationMs, intervals, teamColorByTeamId);
  return { segments, teamShares: buildZoneStripShares(segments, teamLines, durationMs) };
}

// A match where the counts never diverge renders no overlay, matching the player-advantage
// behaviour.
export function buildZoneAdvantage(
  zoneTimeline: readonly StrongholdsZoneCountSample[],
  teamIds: readonly number[],
  durationMs: number,
): PlayerAdvantageData | null {
  const windows = buildZoneCountWindows(zoneTimeline, teamIds, durationMs);
  if (windows == null) {
    return null;
  }

  // both teams spawn owning one zone, so the series is even until the first sample
  const points: ScoreProgressionPoint[] = windows[0].startMs > 0 ? [{ timestampMs: 0, score: 0 }] : [];
  let hasAdvantage = false;
  for (const window of windows) {
    const score = window.count0 - window.count1;
    points.push({ timestampMs: window.startMs, score });
    if (score !== 0) {
      hasAdvantage = true;
    }
  }
  if (!hasAdvantage) {
    return null;
  }
  extendToDuration(points, durationMs);
  return { points, minScore: -ZONE_ADVANTAGE_DOMAIN, maxScore: ZONE_ADVANTAGE_DOMAIN };
}
