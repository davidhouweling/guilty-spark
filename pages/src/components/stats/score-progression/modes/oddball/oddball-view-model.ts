import type { OddballTimeline } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { TICK_FILL } from "../../chart-constants";
import { tileSegments } from "../../timeline-segments";
import type { OddballRoundData, OddballRoundTeamScore } from "../../types";

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
