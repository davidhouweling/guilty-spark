import type { SeriesMatchesResponse } from "@guilty-spark/shared/contracts/stats/series-matches";
import type { SeriesMatchesService } from "../series-matches-types";

export function aFakeSeriesMatchesServiceWith(response: Partial<SeriesMatchesResponse> = {}): SeriesMatchesService {
  return {
    getSeriesMatches: async (): Promise<SeriesMatchesResponse> => {
      return Promise.resolve({
        playerXuidToGametag: {},
        matches: [],
        ...response,
      });
    },
  };
}
