import type { SeriesMatchesResponse } from "@guilty-spark/shared/contracts/stats/series-matches";

export interface SeriesMatchesService {
  getSeriesMatches(matchIds: readonly string[], trackerId?: string): Promise<SeriesMatchesResponse>;
}
