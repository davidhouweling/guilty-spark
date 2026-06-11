import {
  SUPPORTED_ANALYTICS_MODULES,
  type AnalyticsModule,
  type MatchAnalytics,
} from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { HaloService } from "../halo/halo";
import type { LogService } from "../log/types";

export interface AnalyticsService {
  getMatchAnalytics(matchId: string, modules: string[]): Promise<MatchAnalytics>;
}

const supportedAnalyticsModuleSet = new Set<string>(SUPPORTED_ANALYTICS_MODULES);

function isSupportedAnalyticsModule(module: string): module is AnalyticsModule {
  return supportedAnalyticsModuleSet.has(module);
}

// TODO: implement once film data is integrated
export function createAnalyticsService(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _env: Env,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _haloService: HaloService,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _logService: LogService,
): AnalyticsService {
  return {
    async getMatchAnalytics(_matchId: string, modules: string[]): Promise<MatchAnalytics> {
      // Stub: will be replaced when film data integration is implemented.
      // The actual implementation will:
      // 1. Fetch film metadata from Halo API (with caching)
      // 2. Download film chunks (with caching)
      // 3. Parse and compute analytics

      const requestedModules = modules.filter(isSupportedAnalyticsModule);
      if (requestedModules.length === 0) {
        return Promise.reject(new Error("No supported analytics modules requested"));
      }

      return Promise.resolve({
        requestedModules,
        killMatrix: {},
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
      });
    },
  };
}
