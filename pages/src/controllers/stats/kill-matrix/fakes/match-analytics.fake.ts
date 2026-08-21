import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";

export function aFakeMatchAnalyticsWith(overrides: Partial<MatchAnalytics> = {}): MatchAnalytics {
  return {
    requestedModules: ["killMatrix"],
    killMatrix: {
      "111:222": {
        count: 3,
        perfects: 0,
      },
      "111:111": {
        count: 1,
        perfects: 0,
      },
      "333:444": {
        count: 2,
        perfects: 1,
      },
    },
    scoreProgression: null,
    ...overrides,
  };
}
