import { matchDetailContract, matchDetailQuerySchema } from "@guilty-spark/shared/contracts/stats/detail";
import { normalizeTrackerId } from "./normalize-tracker-id";
import type { MatchDetailsService } from "./detail-types";

interface RealMatchDetailsServiceOptions {
  readonly apiHost: string;
}

export class RealMatchDetailsService implements MatchDetailsService {
  private readonly apiHost: string;

  constructor({ apiHost }: RealMatchDetailsServiceOptions) {
    this.apiHost = apiHost;
  }

  async getMatchDetails(
    matchIds: readonly string[],
    trackerId?: string,
  ): ReturnType<MatchDetailsService["getMatchDetails"]> {
    const parsedQuery = matchDetailQuerySchema.parse({ matchIds: matchIds.join(",") });
    const query = new URLSearchParams({ matchIds: parsedQuery.matchIds.join(",") });
    const normalizedTrackerId = normalizeTrackerId(trackerId);
    if (normalizedTrackerId != null) {
      query.set("trackerId", normalizedTrackerId);
    }

    const response = await fetch(`${this.apiHost}/api/stats/match-details?${query.toString()}`, {
      credentials: "include",
    });
    return matchDetailContract.fromResponse(response);
  }
}
