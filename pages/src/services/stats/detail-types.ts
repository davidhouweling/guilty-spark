import type { MatchDetailResponse, SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";

export interface MatchDetailsService {
  getMatchDetails(matchIds: readonly string[], trackerId?: string): Promise<MatchDetailResponse>;
}

export interface SeriesDetailService {
  getSeriesDetail(seriesId: string, matchIds: readonly string[], trackerId?: string): Promise<SeriesDetailResponse>;
}
