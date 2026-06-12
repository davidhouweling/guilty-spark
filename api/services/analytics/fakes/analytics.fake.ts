import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";

export interface FakeAnalyticsService {
  getMatchAnalytics(matchId: string, modules: string[]): Promise<MatchAnalytics>;
}

export function aFakeAnalyticsServiceWith(overrides: Partial<FakeAnalyticsService> = {}): FakeAnalyticsService {
  return {
    getMatchAnalytics: async (_matchId: string, modules: string[]): Promise<MatchAnalytics> => {
      const requestedModules = modules.filter((module): module is "killMatrix" => module === "killMatrix");
      if (requestedModules.length === 0) {
        requestedModules.push("killMatrix");
      }

      return Promise.resolve({
        requestedModules,
        killMatrix: {},
        metadata: {
          pairingQuality: {
            unpairedDeathCount: 0,
            maxTimeDeltaMs: 0,
          },
          perfectCounts: {
            total: 0,
            byXuid: {},
          },
        },
      });
    },
    ...overrides,
  };
}
