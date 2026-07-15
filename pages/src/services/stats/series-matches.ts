import { seriesMatchesContract } from "@guilty-spark/shared/contracts/stats/series-matches";
import { normalizeTrackerId } from "./normalize-tracker-id";
import type { SeriesMatchesService } from "./series-matches-types";

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
  ): ReturnType<SeriesMatchesService["getSeriesMatches"]> {
    const query = new URLSearchParams({ matchIds: matchIds.join(",") });
    const normalizedTrackerId = normalizeTrackerId(trackerId);
    if (normalizedTrackerId != null) {
      query.set("trackerId", normalizedTrackerId);
    }
    const response = await fetch(`${this.apiHost}/api/stats/series-matches?${query.toString()}`, {
      credentials: "include",
    });
    return seriesMatchesContract.fromResponse(response);
  }
}
