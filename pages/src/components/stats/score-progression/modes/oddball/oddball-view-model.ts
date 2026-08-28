import type { OddballRound, OddballTimeline } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { TICK_FILL } from "../../chart-constants";
import { tileSegments } from "../../timeline-segments";
import type { OddballRoundData, OddballRoundTeamScore, TimelineGanttSegment } from "../../types";

function buildRoundSegments(round: OddballRound, teamColorByTeamId: Map<number, string>): TimelineGanttSegment[] {
  const clipped = round.carrySegments
    .map((segment) => ({
      startMs: Math.max(segment.startMs, round.startMs),
      endMs: Math.min(segment.endMs, round.endMs),
      teamId: segment.teamId,
    }))
    .filter((segment) => segment.endMs > segment.startMs);
  return tileSegments(round.startMs, round.endMs, clipped, teamColorByTeamId);
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
      segments: buildRoundSegments(round, teamColorByTeamId),
      winnerColor: round.winnerTeamId != null ? (teamColorByTeamId.get(round.winnerTeamId) ?? null) : null,
      winnerName: round.winnerTeamId != null ? getTeamName(round.winnerTeamId) : null,
      teamScores,
    };
  });
}
