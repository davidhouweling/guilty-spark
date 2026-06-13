import type {
  AnalyticsModule,
  MatchAnalytics,
} from "@guilty-spark/shared/contracts/stats/match-analytics";

export interface MatchAnalyticsService {
  getMatchAnalytics(matchId: string, modules?: readonly AnalyticsModule[]): Promise<MatchAnalytics>;
}
