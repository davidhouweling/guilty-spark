import type { OddballRound, OddballTimeline } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { TICK_FILL } from "../../chart-constants";
import { zeroScores } from "../../score-samples";
import { tileSegments } from "../../timeline-segments";
import type { OddballRoundData, OddballRoundTeamScore, ScoreSample } from "../../types";

export interface OddballScoreSeries {
  readonly samples: readonly ScoreSample[];
  readonly roundBoundaries: readonly number[];
}

// key presence matters as much as the value: an omitted team means "carry the previous score
// forward" downstream, so a sparse record must never compare equal to an explicit zero reset
function scoresEqual(a: Record<string, number>, b: Record<string, number>, teamIds: readonly number[]): boolean {
  return teamIds.every((teamId) => {
    const key = String(teamId);
    return key in a === key in b && (a[key] ?? 0) === (b[key] ?? 0);
  });
}

function pushSample(samples: ScoreSample[], sample: ScoreSample, teamIds: readonly number[]): void {
  const last = samples.at(-1);
  if (last?.timestampMs === sample.timestampMs && scoresEqual(last.runningScores, sample.runningScores, teamIds)) {
    return;
  }
  samples.push(sample);
}

function holdLastValueTo(samples: ScoreSample[], timestampMs: number): void {
  const last = samples.at(-1);
  if (last != null && last.timestampMs < timestampMs) {
    samples.push({ timestampMs, runningScores: { ...last.runningScores } });
  }
}

function appendRoundCurve(
  samples: ScoreSample[],
  round: OddballRound,
  startMs: number,
  endMs: number,
  teamIds: readonly number[],
): void {
  const inRoundPoints = [...round.points]
    .sort((a, b) => a.timestampMs - b.timestampMs)
    .filter((point) => point.timestampMs >= startMs && point.timestampMs <= endMs);
  for (const point of inRoundPoints) {
    pushSample(samples, { timestampMs: point.timestampMs, runningScores: point.runningScores }, teamIds);
  }
}

// A round the solver produced no curve for at all: slope the round score against the round's
// TRUE window (not the overlap-clamped start or the duration-clamped end), so a truncated
// round shows only the fraction earned by the cut.
function appendUniformRamp(
  samples: ScoreSample[],
  round: OddballRound,
  endMs: number,
  teamIds: readonly number[],
): void {
  const trueStartMs = Math.max(0, round.startMs);
  const trueEndMs = Math.max(round.endMs, trueStartMs + 1);
  const rampScores: Record<string, number> = {};
  for (const teamId of teamIds) {
    const target = round.scores[String(teamId)] ?? 0;
    rampScores[String(teamId)] = Math.round((target * (endMs - trueStartMs)) / (trueEndMs - trueStartMs));
  }
  pushSample(samples, { timestampMs: endMs, runningScores: rampScores }, teamIds);
}

// Stitches the solver's authoritative per-round score curves (round.points) into one
// match-long series: scores hold flat between rounds and reset vertically at each round start.
export function buildOddballScoreSeries(
  timeline: OddballTimeline,
  teamIds: readonly number[],
  durationMs: number,
): OddballScoreSeries {
  const samples: ScoreSample[] = [];
  const roundBoundaries: number[] = [];
  const rounds = [...timeline.rounds].sort((a, b) => a.startMs - b.startMs);

  for (const round of rounds) {
    // overlapping round windows must not emit samples that travel back in time
    const startMs = Math.max(0, round.startMs, samples.at(-1)?.timestampMs ?? 0);
    const endMs = Math.min(round.endMs, durationMs);
    if (endMs <= startMs) {
      continue;
    }

    const isFirstEmittedRound = samples.length === 0;
    holdLastValueTo(samples, startMs);
    if (!isFirstEmittedRound) {
      roundBoundaries.push(startMs);
    }
    pushSample(samples, { timestampMs: startMs, runningScores: zeroScores(teamIds) }, teamIds);

    if (round.points.length > 0) {
      appendRoundCurve(samples, round, startMs, endMs, teamIds);
    } else {
      appendUniformRamp(samples, round, endMs, teamIds);
    }
    holdLastValueTo(samples, endMs);
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
