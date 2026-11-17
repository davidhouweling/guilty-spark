import { seriesMatchesContract } from "@guilty-spark/shared/contracts/stats/series-matches";
import {
  MATCH_DETAIL_BATCH_LIMIT,
  matchDetailContract,
  matchDetailQuerySchema,
  seriesDetailContract,
  seriesDetailRequestSchema,
} from "@guilty-spark/shared/contracts/stats/detail";
import type { SeriesTeamMappingMode } from "@guilty-spark/shared/contracts/stats/detail";
import { createApiUrl } from "../api-url";
import { normalizeTrackerId } from "../stats/normalize-tracker-id";
import type { SeriesMatchesService } from "./types";
import { getDetailQuery } from "./get-detail-query";

interface RealSeriesMatchesServiceOptions {
  readonly apiHost: string;
}

export class RealSeriesMatchesService implements SeriesMatchesService {
  private readonly apiHost: string;

  constructor({ apiHost }: RealSeriesMatchesServiceOptions) {
    this.apiHost = apiHost;
  }

  async getSeriesMatches(
    matchIds: readonly string[],
    trackerId?: string,
    anchorMatchId?: string,
  ): ReturnType<SeriesMatchesService["getSeriesMatches"]> {
    const url = createApiUrl(this.apiHost, "/api/stats/series-matches");
    url.searchParams.set("matchIds", matchIds.join(","));
    const normalizedTrackerId = normalizeTrackerId(trackerId);
    if (normalizedTrackerId != null) {
      url.searchParams.set("trackerId", normalizedTrackerId);
    }
    if (anchorMatchId != null && anchorMatchId.length > 0) {
      url.searchParams.set("anchorMatchId", anchorMatchId);
    }
    const response = await fetch(url.toString(), {
      credentials: "include",
    });
    return seriesMatchesContract.fromResponse(response);
  }

  async getMatchDetails(
    matchIds: readonly string[],
    trackerId?: string,
  ): ReturnType<SeriesMatchesService["getMatchDetails"]> {
    const url = createApiUrl(this.apiHost, "/api/stats/match-details");
    url.search = getDetailQuery(matchIds, trackerId);
    return matchDetailContract.fromResponse(await fetch(url.toString(), { credentials: "include" }));
  }

  async getSeriesDetail(
    seriesId: string,
    matchIds: readonly string[],
    trackerId?: string,
    teamMappingMode?: SeriesTeamMappingMode,
  ): ReturnType<SeriesMatchesService["getSeriesDetail"]> {
    const request = seriesDetailRequestSchema.parse({ matchIds, teamMappingMode });
    const url = new URL(`/api/stats/series-details/${encodeURIComponent(seriesId)}`, this.apiHost);
    const usePost = request.matchIds.length > MATCH_DETAIL_BATCH_LIMIT;
    if (!usePost) {
      const parsedQuery = matchDetailQuerySchema.parse({ matchIds: request.matchIds.join(",") });
      url.searchParams.set("matchIds", parsedQuery.matchIds.join(","));
    }
    const normalizedTrackerId = normalizeTrackerId(trackerId);
    if (normalizedTrackerId != null) {
      url.searchParams.set("trackerId", normalizedTrackerId);
    }
    if (!usePost && request.teamMappingMode != null) {
      url.searchParams.set("teamMappingMode", request.teamMappingMode);
    }

    const response = await fetch(
      url.toString(),
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
