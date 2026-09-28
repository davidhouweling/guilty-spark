import type { MatchAnalytics, AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import {
  BATCH_MATCH_ANALYTICS_MAX_MATCH_IDS,
  batchMatchAnalyticsContract,
} from "@guilty-spark/shared/contracts/stats/batch-match-analytics";
import { normalizeTrackerId } from "./normalize-tracker-id";
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
    const normalizedTrackerId = normalizeTrackerId(trackerId);
    const uniqueMatchIds = [...new Set(matchIds)];
    const results: Record<string, MatchAnalytics | null> = {};

    for (let index = 0; index < uniqueMatchIds.length; index += BATCH_MATCH_ANALYTICS_MAX_MATCH_IDS) {
      const matchIdBatch = uniqueMatchIds.slice(index, index + BATCH_MATCH_ANALYTICS_MAX_MATCH_IDS);
      const query = new URLSearchParams({
        matchIds: matchIdBatch.join(","),
        modules: buildModulesQuery(normalizedModules),
      });
      if (normalizedTrackerId != null) {
        query.set("trackerId", normalizedTrackerId);
      }
      const response = await fetch(`${this.apiHost}/api/stats/match-analytics?${query.toString()}`, {
        credentials: "include",
      });
      const parsed = await batchMatchAnalyticsContract.fromResponse(response);
      Object.assign(results, parsed.results);
    }

    return results;
  }
}
