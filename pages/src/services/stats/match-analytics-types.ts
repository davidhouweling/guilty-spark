import type { AnalyticsModule, MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";

export interface MatchAnalyticsService {
  getBatchMatchAnalytics(
    matchIds: readonly string[],
    modules?: readonly AnalyticsModule[],
    trackerId?: string,
  ): Promise<Record<string, MatchAnalytics | null>>;
}
