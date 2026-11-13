import { matchDetailQuerySchema, seriesDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import { normalizeTrackerId } from "./normalize-tracker-id";
import type { SeriesDetailService } from "./detail-types";

interface RealSeriesDetailServiceOptions {
  readonly apiHost: string;
}

export class RealSeriesDetailService implements SeriesDetailService {
  private readonly apiHost: string;

  constructor({ apiHost }: RealSeriesDetailServiceOptions) {
    this.apiHost = apiHost;
  }

  async getSeriesDetail(
    seriesId: string,
    matchIds: readonly string[],
    trackerId?: string,
  ): ReturnType<SeriesDetailService["getSeriesDetail"]> {
    const parsedQuery = matchDetailQuerySchema.parse({ matchIds: matchIds.join(",") });
    const query = new URLSearchParams({ matchIds: parsedQuery.matchIds.join(",") });
    const normalizedTrackerId = normalizeTrackerId(trackerId);
    if (normalizedTrackerId != null) {
      query.set("trackerId", normalizedTrackerId);
    }

    const response = await fetch(
      `${this.apiHost}/api/stats/series-details/${encodeURIComponent(seriesId)}?${query.toString()}`,
      { credentials: "include" },
    );
    return seriesDetailContract.fromResponse(response);
  }
}
