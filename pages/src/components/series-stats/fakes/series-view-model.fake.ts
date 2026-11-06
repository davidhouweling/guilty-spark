import type { MatchStats } from "halo-infinite-api";
import { sampleLiveTrackerStateMessage } from "@guilty-spark/shared/live-tracker/fakes/data";
import { isMatchStats } from "../../../controllers/stats/is-match-stats";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import type { BuildSeriesViewModelArgs, ResolvedSeriesMatch } from "../build-series-view-model";

export function aFakeSeriesViewModelArgsWith(
  matchIds: readonly string[] = sampleLiveTrackerStateMessage.data.matchSummaries.map((match) => match.matchId),
): BuildSeriesViewModelArgs {
  const state = sampleLiveTrackerStateMessage.data;
  const summariesById = new Map(state.matchSummaries.map((match) => [match.matchId, match]));
  const matches: ResolvedSeriesMatch[] = matchIds.flatMap((matchId) => {
    const summary = summariesById.get(matchId);
    if (summary == null) {
      return [];
    }

    const rawMatch = state.rawMatches[matchId] ?? {};
    return [
      {
        matchId: summary.matchId,
        gameTypeAndMap: summary.gameTypeAndMap,
        gameVariantCategory: isMatchStats(rawMatch) ? rawMatch.MatchInfo.GameVariantCategory : 0,
        gameType: summary.gameType,
        gameMap: summary.gameMap,
        gameMapThumbnailUrl: summary.gameMapThumbnailUrl,
        duration: summary.duration,
        gameScore: summary.gameScore,
        gameSubScore: summary.gameSubScore,
        startTime: summary.startTime,
        endTime: summary.endTime,
        rawMatch,
      },
    ];
  });
  const rawMatches = matches.map((match) => match.rawMatch).filter((match): match is MatchStats => isMatchStats(match));
  const playerMap = new Map(
    matches.flatMap((match) => {
      const summary = summariesById.get(match.matchId);
      return summary == null ? [] : Object.entries(summary.playerXuidToGametag);
    }),
  );

  return {
    series: {
      title: `Queue #${state.queueNumber.toString()} Series Stats`,
      subtitle: state.guildName,
      score: state.seriesScore,
    },
    matches,
    rawMatches,
    medalMetadata: {},
    playerMap,
    teamColors: [getTeamColorOrDefault(undefined, 0), getTeamColorOrDefault(undefined, 1)],
    analyticsByMatchId: new Map(),
    killMatrixStatus: ComponentLoaderStatus.PENDING,
    scoreProgressionStatus: ComponentLoaderStatus.PENDING,
  };
}
