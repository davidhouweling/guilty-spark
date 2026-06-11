import type { HaloService } from "../halo/halo";
import type { LogService } from "../log/types";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";

export interface AnalyticsService {
  getMatchAnalytics(matchId: string, modules: string[]): Promise<MatchAnalytics>;
}

export function createAnalyticsService(
  _env: Env,
  _haloService: HaloService,
  _logService: LogService,
): AnalyticsService {
  return {
    async getMatchAnalytics(_matchId: string, modules: string[]): Promise<MatchAnalytics> {
      // For now, return stub data. Will be implemented when film data is integrated.
      // The actual implementation will:
      // 1. Fetch film metadata from Halo API (with caching)
      // 2. Download film chunks (with caching)
      // 3. Parse and compute analytics
      // 4. Return based on requested modules

      const requestedModules = modules as Array<"killMatrix">;

      return {
        requestedModules,
        killMatrix: requestedModules.includes("killMatrix") ? {} : undefined,
        metadata: {
          pairingQuality: {
            unpairedDeathCount: 0,
            maxTimeDeltaMs: 1,
          },
          perfectCounts: {
            total: 0,
            byXuid: {},
          },
        },
      };
    },
  };
}
