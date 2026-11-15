import type { MatchDetail, SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import {
  aFakeMatchDetailWith,
  aFakeSeriesDetailResponseWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { aFakePlayerWith, aFakeTeamWith } from "@guilty-spark/shared/contracts/stats/fakes/detail-primitives.fake";

export function aFakeViewerSeriesMatchWith(overrides: Partial<MatchDetail> = {}): MatchDetail {
  return aFakeMatchDetailWith({
    teamCount: 2,
    teams: [0, 1].map((id) => aFakeTeamWith({ matchTeamId: id, seriesTeamId: id, name: null })),
    players: ["1111111111", "2222222222", "3333333333", "4444444444"].map((xuid, index) => {
      const teamId = index < 2 ? 0 : 1;
      return aFakePlayerWith({
        playerId: `xuid(${xuid})`,
        xuid,
        lastMatchTeamId: teamId,
        teamStats: [{ matchTeamId: teamId, seriesTeamId: teamId, stats: [], medals: [] }],
      });
    }),
    score: {
      primary: {
        metric: "score",
        teams: [
          { matchTeamId: 0, seriesTeamId: 0, value: 50 },
          { matchTeamId: 1, seriesTeamId: 1, value: 40 },
        ],
      },
      secondary: {
        metric: "score",
        teams: [
          { matchTeamId: 0, seriesTeamId: 0, value: 80 },
          { matchTeamId: 1, seriesTeamId: 1, value: 60 },
        ],
      },
    },
    ...overrides,
  });
}

export function aFakeViewerSeriesDetailWith(
  matchIds: readonly string[],
  overrides: Partial<SeriesDetailResponse> = {},
): SeriesDetailResponse {
  return aFakeSeriesDetailResponseWith({
    seriesId: "series-1",
    matches: {
      matchIds: [...matchIds],
      results: matchIds.map((matchId) => ({
        status: "resolved",
        matchId,
        detail: aFakeViewerSeriesMatchWith({ matchId }),
      })),
    },
    ...overrides,
  });
}
