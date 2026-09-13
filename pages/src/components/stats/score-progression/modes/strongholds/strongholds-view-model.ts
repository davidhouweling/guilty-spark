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
  TeamPercentShare,
  ZoneStripData,
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

// The strip encodes the leader's grip as the segment's rendered opacity: a 3-cap paints the full
// team colour, a 2-zone hold a dimmer one, and a single zone dimmer still.
function zoneLeadOpacity(leaderZoneCount: number): number {
  if (leaderZoneCount <= 1) {
    return 0.4;
  }
  return leaderZoneCount === 2 ? 0.7 : 1;
}

export interface ZoneCountWindow {
  readonly startMs: number;
  readonly endMs: number;
  readonly count0: number;
  readonly count1: number;
}

// Zone ownership is a step function, so each sample's counts hold until the next sample. Empty
// when the mode's two-team shape does not hold or no sample lands inside the match.
export function buildZoneCountWindows(
  zoneTimeline: readonly StrongholdsZoneCountSample[],
  teamIds: readonly number[],
  durationMs: number,
): ZoneCountWindow[] {
  if (teamIds.length !== 2) {
    return [];
  }
  const [teamId0, teamId1] = teamIds;
  const key0 = String(teamId0);
  const key1 = String(teamId1);
  const inMatchSamples = zoneTimeline
    .filter((sample) => sample.timestampMs <= durationMs)
    .sort((a, b) => a.timestampMs - b.timestampMs);
  return inMatchSamples.map((sample, sampleIndex) => ({
    startMs: sample.timestampMs,
    endMs: inMatchSamples[sampleIndex + 1]?.timestampMs ?? durationMs,
    count0: sample.zoneCounts[key0] ?? 0,
    count1: sample.zoneCounts[key1] ?? 0,
  }));
}

function buildZoneStripShares(
  leadMsByTeamId: ReadonlyMap<number, number>,
  teamLines: readonly ScoreProgressionTeamLine[],
  durationMs: number,
): TeamPercentShare[] {
  return teamLines.map((line) => {
    const leadMs = leadMsByTeamId.get(line.teamId) ?? 0;
    return {
      teamId: line.teamId,
      name: line.name,
      color: line.color,
      // flooring keeps the two shares from summing past 100, and a lead too brief to floor to
      // 1% still counts as time spent ahead
      percentage: leadMs > 0 ? Math.max(1, Math.floor((leadMs / durationMs) * 100)) : 0,
    };
  });
}

// One gantt strip coloured by whoever holds more zones at each moment; ties stay neutral.
export function buildZoneControlStrip(
  windows: readonly ZoneCountWindow[],
  teamLines: readonly ScoreProgressionTeamLine[],
  durationMs: number,
): ZoneStripData | null {
  if (teamLines.length !== 2 || durationMs <= 0) {
    return null;
  }
  const [line0, line1] = teamLines;

  const intervals: OccupiedInterval[] = [];
  const leadMsByTeamId = new Map<number, number>();
  for (const window of windows) {
    if (window.endMs <= window.startMs || window.count0 === window.count1) {
      continue;
    }
    const leader = window.count0 > window.count1 ? line0 : line1;
    intervals.push({
      startMs: window.startMs,
      endMs: window.endMs,
      teamId: leader.teamId,
      opacity: zoneLeadOpacity(Math.max(window.count0, window.count1)),
    });
    leadMsByTeamId.set(leader.teamId, (leadMsByTeamId.get(leader.teamId) ?? 0) + (window.endMs - window.startMs));
  }
  // a match where the counts never diverge has no strip, matching the zone-advantage behaviour
  if (intervals.length === 0) {
    return null;
  }

  const teamColorByTeamId = new Map(teamLines.map((line) => [line.teamId, line.color]));
  return {
    segments: tileSegments(0, durationMs, intervals, teamColorByTeamId),
    teamShares: buildZoneStripShares(leadMsByTeamId, teamLines, durationMs),
  };
}

// A match where the counts never diverge renders no overlay, matching the player-advantage
// behaviour; a divergence confined to a zero-width window never existed in time, so it counts
// for neither this overlay nor the zone strip.
export function buildZoneAdvantage(
  windows: readonly ZoneCountWindow[],
  durationMs: number,
): PlayerAdvantageData | null {
  // both teams spawn owning one zone, so the series is even until the first sample
  const points: ScoreProgressionPoint[] = (windows.at(0)?.startMs ?? 0) > 0 ? [{ timestampMs: 0, score: 0 }] : [];
  let hasAdvantage = false;
  for (const window of windows) {
    if (window.endMs <= window.startMs) {
      continue;
    }
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
