import { seriesMatchesContract } from "@guilty-spark/shared/contracts/stats/series-matches";
import { matchDetailContract, seriesDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
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
    const query = new URLSearchParams({ matchIds: matchIds.join(",") });
    const normalizedTrackerId = normalizeTrackerId(trackerId);
    if (normalizedTrackerId != null) {
      query.set("trackerId", normalizedTrackerId);
    }
    if (anchorMatchId != null && anchorMatchId.length > 0) {
      query.set("anchorMatchId", anchorMatchId);
    }
    const response = await fetch(`${this.apiHost}/api/stats/series-matches?${query.toString()}`, {
      credentials: "include",
    });
    return seriesMatchesContract.fromResponse(response);
  }

  async getMatchDetails(
    matchIds: readonly string[],
    trackerId?: string,
  ): ReturnType<SeriesMatchesService["getMatchDetails"]> {
    const query = getDetailQuery(matchIds, trackerId);
    return matchDetailContract.fromResponse(
      await fetch(`${this.apiHost}/api/stats/match-details?${query}`, { credentials: "include" }),
    );
  }

  async getSeriesDetail(
    seriesId: string,
    matchIds: readonly string[],
    trackerId?: string,
  ): ReturnType<SeriesMatchesService["getSeriesDetail"]> {
    const query = getDetailQuery(matchIds, trackerId);
    return seriesDetailContract.fromResponse(
      await fetch(`${this.apiHost}/api/stats/series-details/${encodeURIComponent(seriesId)}?${query}`, {
        credentials: "include",
      }),
    );
  }
}
