import type { SeriesMatchesResponse } from "@guilty-spark/shared/contracts/stats/series-matches";
import type { MatchDetailResponse, SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";

export interface SeriesMatchesService {
  getSeriesMatches(
    matchIds: readonly string[],
    trackerId?: string,
    anchorMatchId?: string,
  ): Promise<SeriesMatchesResponse>;
  getMatchDetails(matchIds: readonly string[], trackerId?: string): Promise<MatchDetailResponse>;
  getSeriesDetail(seriesId: string, matchIds: readonly string[], trackerId?: string): Promise<SeriesDetailResponse>;
}
