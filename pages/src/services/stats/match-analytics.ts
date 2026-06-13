import {
  type AnalyticsModule,
  matchAnalyticsContract,
} from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { MatchAnalyticsService } from "./match-analytics-types";

interface RealMatchAnalyticsServiceOptions {
  readonly apiHost: string;
}

const DEFAULT_MODULES: readonly AnalyticsModule[] = ["killMatrix"];

function buildModulesQuery(modules: readonly AnalyticsModule[]): string {
  return modules.join(",");
}

export class RealMatchAnalyticsService implements MatchAnalyticsService {
  private readonly apiHost: string;

  constructor({ apiHost }: RealMatchAnalyticsServiceOptions) {
    this.apiHost = apiHost;
  }

  async getMatchAnalytics(matchId: string, modules: readonly AnalyticsModule[] = DEFAULT_MODULES): Promise<MatchAnalytics> {
    const query = new URLSearchParams({ modules: buildModulesQuery(modules) });
    const response = await fetch(`${this.apiHost}/api/stats/match-analytics/${matchId}?${query.toString()}`, {
      credentials: "include",
    });
    const parsed = await matchAnalyticsContract.fromResponse(response);
    return parsed.analytics;
  }
}
