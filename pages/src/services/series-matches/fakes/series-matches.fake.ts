import { sampleLiveTrackerStateMessage } from "@guilty-spark/shared/live-tracker/fakes/data";
import type { SeriesMatchesResponse } from "@guilty-spark/shared/contracts/stats/series-matches";
import { matchDetailContract, seriesDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import type { MatchDetailResponse, SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import {
  aFakeMatchDetailWith,
  aFakeSeriesDetailResponseWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { isMatchStats } from "../../../controllers/stats/is-match-stats";
import type { SeriesMatchesService } from "../types";

function getGameVariantCategory(matchId: string): number {
  const rawMatch = sampleLiveTrackerStateMessage.data.rawMatches[matchId];
  return isMatchStats(rawMatch) ? rawMatch.MatchInfo.GameVariantCategory : 0;
}

// Matches requested ids against the shared live-tracker sample so expanding a fake match/series
// resolves to real MatchStats data instead of an empty response. Unknown ids are skipped, matching
// how the real API only returns matches it can find.
function buildSampleResponse(matchIds: readonly string[]): SeriesMatchesResponse {
  const { matchSummaries, rawMatches } = sampleLiveTrackerStateMessage.data;
  const matchesById = new Map(matchSummaries.map((match) => [match.matchId, match]));
  const playerXuidToGametag: Record<string, string> = {};
  const matches: SeriesMatchesResponse["matches"] = [];

  for (const matchId of matchIds) {
    const match = matchesById.get(matchId);
    if (match == null) {
      continue;
    }

    Object.assign(playerXuidToGametag, match.playerXuidToGametag);
    matches.push({
      matchId: match.matchId,
      gameTypeAndMap: match.gameTypeAndMap,
      gameVariantCategory: getGameVariantCategory(matchId),
      gameType: match.gameType,
      gameMap: match.gameMap,
      gameMapThumbnailUrl: match.gameMapThumbnailUrl,
      duration: match.duration,
      gameScore: match.gameScore,
      gameSubScore: match.gameSubScore,
      startTime: match.startTime,
      endTime: match.endTime,
      rawMatch: rawMatches[matchId] ?? {},
    });
  }

  return { playerXuidToGametag, matches };
}

function buildMatchDetails(matchIds: readonly string[]): MatchDetailResponse {
  return {
    matchIds: [...matchIds],
    results: matchIds.map((matchId) => ({
      status: "resolved",
      matchId,
      detail: aFakeMatchDetailWith({ matchId }),
    })),
  };
}

export function aFakeSeriesMatchesServiceWith(response?: Partial<SeriesMatchesResponse>): SeriesMatchesService {
  return {
    getSeriesMatches: async (matchIds): Promise<SeriesMatchesResponse> => {
      if (response != null) {
        return Promise.resolve({ playerXuidToGametag: {}, matches: [], ...response });
      }

      return Promise.resolve(buildSampleResponse(matchIds));
    },
    getMatchDetails: async (matchIds): Promise<MatchDetailResponse> =>
      Promise.resolve(matchDetailContract.parse(buildMatchDetails(matchIds))),
    getSeriesDetail: async (seriesId, matchIds): Promise<SeriesDetailResponse> =>
      Promise.resolve(
        seriesDetailContract.parse(aFakeSeriesDetailResponseWith({ seriesId, matches: buildMatchDetails(matchIds) })),
      ),
  };
}
