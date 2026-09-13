import type { OddballTimeline } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { getTeamColorOrDefault } from "../../../../team-colors/team-colors";
import { TICK_FILL } from "../../chart-constants";
import { extendToDuration } from "../../extend-to-duration";
import { tileSegments } from "../../timeline-segments";
import type {
  OddballRoundData,
  OddballRoundTeamScore,
  ScoreProgressionPoint,
  ScoreProgressionTeamLine,
} from "../../types";

export interface OddballScoreSample {
  readonly timestampMs: number;
  readonly runningScores: Record<string, number>;
}

interface ClampedSegment {
  readonly startMs: number;
  readonly endMs: number;
}

function carrySecondsAt(segments: readonly ClampedSegment[], timestampMs: number): number {
  let seconds = 0;
  for (const segment of segments) {
    seconds += Math.max(0, Math.min(segment.endMs, timestampMs) - segment.startMs) / 1000;
  }
  return seconds;
}

// Oddball scores one point per second of skull carry and resets each round, so the score curve
// is rebuilt per round from the carry segments and scaled so each team's round total lands
// exactly on the API round score (a team with a score but no attributable segments falls back
// to a uniform ramp across the round, mirroring the strongholds degraded-data behaviour).
export function buildOddballScoreSamples(
  timeline: OddballTimeline,
  teamIds: readonly number[],
  durationMs: number,
): OddballScoreSample[] {
  const samples: OddballScoreSample[] = [];
  const rounds = [...timeline.rounds].sort((a, b) => a.startMs - b.startMs);
  for (const round of rounds) {
    const startMs = Math.max(0, round.startMs);
    const endMs = Math.min(round.endMs, durationMs);
    if (endMs <= startMs) {
      continue;
    }

    const segmentsByTeamId = new Map<number, ClampedSegment[]>(teamIds.map((teamId) => [teamId, []]));
    const boundaries = new Set<number>([startMs, endMs]);
    for (const segment of round.carrySegments) {
      const teamSegments = segmentsByTeamId.get(segment.teamId);
      const clampedStart = Math.max(segment.startMs, startMs);
      const clampedEnd = Math.min(segment.endMs, endMs);
      if (teamSegments == null || clampedEnd <= clampedStart) {
        continue;
      }
      teamSegments.push({ startMs: clampedStart, endMs: clampedEnd });
      boundaries.add(clampedStart);
      boundaries.add(clampedEnd);
    }

    const scaleByTeamId = new Map<number, { target: number; rawSeconds: number }>(
      teamIds.map((teamId) => [
        teamId,
        {
          target: round.scores[String(teamId)] ?? 0,
          rawSeconds: carrySecondsAt(segmentsByTeamId.get(teamId) ?? [], endMs),
        },
      ]),
    );

    // carry the previous round's final scores flat to the new round start so the reset renders
    // as a vertical drop rather than a slope across the between-round break
    const previous = samples.at(-1);
    if (previous != null && previous.timestampMs < startMs) {
      samples.push({ timestampMs: startMs, runningScores: { ...previous.runningScores } });
    }

    for (const timestampMs of [...boundaries].sort((a, b) => a - b)) {
      const runningScores: Record<string, number> = {};
      for (const teamId of teamIds) {
        const { target, rawSeconds } = scaleByTeamId.get(teamId) ?? { target: 0, rawSeconds: 0 };
        if (rawSeconds > 0) {
          const raw = carrySecondsAt(segmentsByTeamId.get(teamId) ?? [], timestampMs);
          runningScores[String(teamId)] = Math.round((raw * target) / rawSeconds);
        } else if (target > 0) {
          runningScores[String(teamId)] = Math.round((target * (timestampMs - startMs)) / (endMs - startMs));
        } else {
          runningScores[String(teamId)] = 0;
        }
      }
      samples.push({ timestampMs, runningScores });
    }
  }
  return samples;
}

export function buildOddballTeamLines(
  samples: readonly OddballScoreSample[],
  teamIds: readonly number[],
  teamColorByTeamId: Map<number, string>,
  durationMs: number,
): ScoreProgressionTeamLine[] {
  return teamIds.map((teamId, slotIndex) => {
    const key = String(teamId);
    const points: ScoreProgressionPoint[] = [{ timestampMs: 0, score: 0 }];
    for (const sample of samples) {
      const score = sample.runningScores[key] ?? 0;
      const last = points.at(-1);
      if (last?.timestampMs === sample.timestampMs && last.score === score) {
        continue;
      }
      points.push({ timestampMs: sample.timestampMs, score });
    }
    extendToDuration(points, durationMs);
    return {
      teamId,
      name: getTeamName(teamId),
      color: teamColorByTeamId.get(teamId) ?? getTeamColorOrDefault(undefined, slotIndex).hex,
      points,
    };
  });
}

export function buildOddballRounds(
  timeline: OddballTimeline,
  teamIds: readonly number[],
  teamColorByTeamId: Map<number, string>,
): OddballRoundData[] {
  return timeline.rounds.map((round) => {
    const teamScores: OddballRoundTeamScore[] = teamIds.map((teamId) => ({
      teamId,
      name: getTeamName(teamId),
      color: teamColorByTeamId.get(teamId) ?? TICK_FILL,
      score: round.scores[String(teamId)] ?? 0,
    }));

    return {
      roundIndex: round.roundIndex + 1,
      endedByCap: round.endedByCap,
      segments: tileSegments(round.startMs, round.endMs, round.carrySegments, teamColorByTeamId),
      winnerColor: round.winnerTeamId != null ? (teamColorByTeamId.get(round.winnerTeamId) ?? null) : null,
      winnerName: round.winnerTeamId != null ? getTeamName(round.winnerTeamId) : null,
      teamScores,
    };
  });
}
