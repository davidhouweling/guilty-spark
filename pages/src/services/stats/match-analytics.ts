import { type MatchAnalytics, type AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { batchMatchAnalyticsContract } from "@guilty-spark/shared/contracts/stats/batch-match-analytics";
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

  async getBatchMatchAnalytics(
    matchIds: readonly string[],
    modules: readonly AnalyticsModule[] = DEFAULT_MODULES,
    trackerId?: string,
  ): Promise<Record<string, MatchAnalytics | null>> {
    const normalizedModules = modules.length === 0 ? DEFAULT_MODULES : modules;
    const query = new URLSearchParams({
      matchIds: matchIds.join(","),
      modules: buildModulesQuery(normalizedModules),
    });
    if (trackerId != null) {
      query.set("trackerId", trackerId);
    }
    const response = await fetch(`${this.apiHost}/api/stats/match-analytics?${query.toString()}`, {
      credentials: "include",
    });
    const parsed = await batchMatchAnalyticsContract.fromResponse(response);
    return parsed.results;
  }
}
