import type { OddballTimeline } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { TICK_FILL } from "../../chart-constants";
import { tileSegments } from "../../timeline-segments";
import type { OddballRoundData, OddballRoundTeamScore, ScoreSample } from "../../types";

export interface OddballScoreSeries {
  readonly samples: readonly ScoreSample[];
  readonly roundBoundaries: readonly number[];
}

// Stitches the solver's authoritative per-round score curves (round.points) into one
// match-long series: scores hold flat between rounds and reset vertically at each round start.
// A round with a score but no curve points falls back to a uniform ramp sloped against the
// round's true end, so a duration-truncated round shows only the fraction earned by the cut.
export function buildOddballScoreSeries(
  timeline: OddballTimeline,
  teamIds: readonly number[],
  durationMs: number,
): OddballScoreSeries {
  const samples: ScoreSample[] = [];
  const roundBoundaries: number[] = [];
  const rounds = [...timeline.rounds].sort((a, b) => a.startMs - b.startMs);

  const fillScores = (running: Record<string, number>, previous: ScoreSample | undefined): Record<string, number> => {
    const filled: Record<string, number> = {};
    for (const teamId of teamIds) {
      const key = String(teamId);
      filled[key] = key in running ? (running[key] ?? 0) : (previous?.runningScores[key] ?? 0);
    }
    return filled;
  };

  let emittedRounds = 0;
  for (const round of rounds) {
    const startMs = Math.max(0, round.startMs);
    const endMs = Math.min(round.endMs, durationMs);
    if (endMs <= startMs) {
      continue;
    }

    // carry the previous round's final scores flat to the new round start so the reset renders
    // as a vertical drop rather than a slope across the between-round break
    const previous = samples.at(-1);
    if (previous != null && previous.timestampMs < startMs) {
      samples.push({ timestampMs: startMs, runningScores: { ...previous.runningScores } });
    }
    if (emittedRounds > 0 && roundBoundaries.at(-1) !== startMs) {
      roundBoundaries.push(startMs);
    }
    samples.push({ timestampMs: startMs, runningScores: fillScores({}, undefined) });

    const inRoundPoints = round.points.filter((point) => point.timestampMs >= startMs && point.timestampMs <= endMs);
    if (inRoundPoints.length > 0) {
      for (const point of inRoundPoints) {
        const last = samples.at(-1);
        if (last != null && point.timestampMs < last.timestampMs) {
          continue;
        }
        samples.push({ timestampMs: point.timestampMs, runningScores: fillScores(point.runningScores, last) });
      }
    } else {
      const trueEndMs = Math.max(round.endMs, startMs + 1);
      const rampScores: Record<string, number> = {};
      for (const teamId of teamIds) {
        const target = round.scores[String(teamId)] ?? 0;
        rampScores[String(teamId)] = Math.round((target * (endMs - startMs)) / (trueEndMs - startMs));
      }
      samples.push({ timestampMs: endMs, runningScores: rampScores });
    }

    const last = samples.at(-1);
    if (last != null && last.timestampMs < endMs) {
      samples.push({ timestampMs: endMs, runningScores: { ...last.runningScores } });
    }
    emittedRounds += 1;
  }

  return { samples, roundBoundaries };
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
