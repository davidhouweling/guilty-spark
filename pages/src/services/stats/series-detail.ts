import {
  MATCH_DETAIL_BATCH_LIMIT,
  matchDetailQuerySchema,
  seriesDetailContract,
  seriesDetailRequestSchema,
} from "@guilty-spark/shared/contracts/stats/detail";
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
    const request = seriesDetailRequestSchema.parse({ matchIds });
    const query = new URLSearchParams();
    const usePost = request.matchIds.length > MATCH_DETAIL_BATCH_LIMIT;
    if (!usePost) {
      const parsedQuery = matchDetailQuerySchema.parse({ matchIds: request.matchIds.join(",") });
      query.set("matchIds", parsedQuery.matchIds.join(","));
    }
    const normalizedTrackerId = normalizeTrackerId(trackerId);
    if (normalizedTrackerId != null) {
      query.set("trackerId", normalizedTrackerId);
    }

    const queryString = query.toString();
    const url = `${this.apiHost}/api/stats/series-details/${encodeURIComponent(seriesId)}${queryString === "" ? "" : `?${queryString}`}`;
    const response = await fetch(
      url,
      usePost
        ? {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          }
        : { credentials: "include" },
    );
    return seriesDetailContract.fromResponse(response);
  }
}
