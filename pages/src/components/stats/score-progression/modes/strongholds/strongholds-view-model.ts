import type {
  StrongholdsZoneCountSample,
  StrongholdsZoneEvent,
} from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { extendToDuration } from "../../extend-to-duration";
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

// The strip encodes the leader's grip as colour intensity: a 3-cap paints the full team colour,
// a 2-zone hold a dimmer one, a single zone dimmer still, and a tie stays neutral.
const ZONE_LEAD_ALPHA: Record<number, string> = { 1: "66", 2: "B3" };

function zoneLeadColor(baseColor: string, zoneCount: number): string {
  return `${baseColor}${ZONE_LEAD_ALPHA[zoneCount] ?? ""}`;
}

function pushZoneSegment(segments: TimelineGanttSegment[], segment: TimelineGanttSegment): void {
  const last = segments.at(-1);
  if (last == null) {
    segments.push(segment);
    return;
  }
  if (last.teamId !== segment.teamId || last.color !== segment.color) {
    segments.push(segment);
    return;
  }
  segments[segments.length - 1] = { ...last, endMs: segment.endMs };
}

function buildZoneStripShares(
  segments: readonly TimelineGanttSegment[],
  teamIds: readonly number[],
  teamColorByTeamId: Map<number, string>,
  durationMs: number,
): ZoneStripTeamShare[] {
  return teamIds.map((teamId) => {
    const leadMs = segments
      .filter((segment) => segment.teamId === teamId)
      .reduce((total, segment) => total + (segment.endMs - segment.startMs), 0);
    return {
      teamId,
      name: getTeamName(teamId),
      color: teamColorByTeamId.get(teamId) ?? "",
      leadPercentage: Math.round((leadMs / durationMs) * 100),
    };
  });
}

// One gantt strip coloured by whoever holds more zones at each moment; ties stay neutral. Zone
// ownership is a step function, so each sample's counts hold until the next sample.
export function buildZoneControlStrip(
  zoneTimeline: readonly StrongholdsZoneCountSample[],
  teamIds: readonly number[],
  teamColorByTeamId: Map<number, string>,
  durationMs: number,
): ZoneStripData | null {
  if (teamIds.length !== 2 || durationMs <= 0) {
    return null;
  }
  const [teamId0, teamId1] = teamIds;
  const key0 = String(teamId0);
  const key1 = String(teamId1);
  const inMatchSamples = zoneTimeline.filter((sample) => sample.timestampMs <= durationMs);
  if (inMatchSamples.length === 0) {
    return null;
  }

  const segments: TimelineGanttSegment[] = [];
  // both teams spawn owning one zone, so the strip is neutral until the first sample
  if ((inMatchSamples.at(0)?.timestampMs ?? 0) > 0) {
    segments.push({ startMs: 0, endMs: inMatchSamples[0].timestampMs, teamId: null, color: null });
  }
  for (const [sampleIndex, sample] of inMatchSamples.entries()) {
    const startMs = sample.timestampMs;
    const endMs = inMatchSamples[sampleIndex + 1]?.timestampMs ?? durationMs;
    if (endMs <= startMs) {
      continue;
    }
    const count0 = sample.zoneCounts[key0] ?? 0;
    const count1 = sample.zoneCounts[key1] ?? 0;
    if (count0 === count1) {
      pushZoneSegment(segments, { startMs, endMs, teamId: null, color: null });
      continue;
    }
    const leaderTeamId = count0 > count1 ? teamId0 : teamId1;
    const leaderColor = teamColorByTeamId.get(leaderTeamId);
    pushZoneSegment(segments, {
      startMs,
      endMs,
      teamId: leaderTeamId,
      color: leaderColor != null ? zoneLeadColor(leaderColor, Math.max(count0, count1)) : null,
    });
  }

  return { segments, teamShares: buildZoneStripShares(segments, teamIds, teamColorByTeamId, durationMs) };
}

// Zones owned is a step function that only changes at captures; a match where the counts never
// diverge renders no overlay, matching the player-advantage behaviour.
export function buildZoneAdvantage(
  zoneTimeline: readonly StrongholdsZoneCountSample[],
  teamIds: readonly number[],
  durationMs: number,
): PlayerAdvantageData | null {
  if (teamIds.length !== 2) {
    return null;
  }
  const [teamId0, teamId1] = teamIds;
  const key0 = String(teamId0);
  const key1 = String(teamId1);
  const inMatchSamples = zoneTimeline.filter((sample) => sample.timestampMs <= durationMs);
  if (inMatchSamples.length === 0) {
    return null;
  }

  // both teams spawn owning one zone, so the series is even until the first sample
  const points: ScoreProgressionPoint[] =
    (inMatchSamples.at(0)?.timestampMs ?? 0) > 0 ? [{ timestampMs: 0, score: 0 }] : [];
  let hasAdvantage = false;
  for (const sample of inMatchSamples) {
    const score = (sample.zoneCounts[key0] ?? 0) - (sample.zoneCounts[key1] ?? 0);
    points.push({ timestampMs: sample.timestampMs, score });
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
