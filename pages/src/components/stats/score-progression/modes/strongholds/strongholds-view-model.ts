import type {
  StrongholdsZoneCountSample,
  StrongholdsZoneEvent,
} from "@guilty-spark/shared/contracts/stats/match-analytics";
import { extendToDuration } from "../../extend-to-duration";
import type {
  PlayerAdvantageData,
  ScoreMarkerData,
  ScoreProgressionPoint,
  ScoreProgressionTeamLine,
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
