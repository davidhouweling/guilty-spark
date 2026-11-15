import type { SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";

export interface SeriesDetailService {
  getSeriesDetail(seriesId: string, matchIds: readonly string[], trackerId?: string): Promise<SeriesDetailResponse>;
}
