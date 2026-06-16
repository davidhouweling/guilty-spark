import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";

export function aFakeMatchAnalyticsWith(overrides: Partial<MatchAnalytics> = {}): MatchAnalytics {
  return {
    requestedModules: ["killMatrix"],
    killMatrix: {
      "111:222": {
        count: 3,
        headshotKills: 1,
        perfects: 0,
        weapons: [
          { weaponId: 6001, count: 1 },
          { weaponId: 5001, count: 2 },
        ],
      },
      "111:111": {
        count: 1,
        headshotKills: 0,
        perfects: 0,
        weapons: [],
      },
      "333:444": {
        count: 2,
        headshotKills: 0,
        perfects: 1,
        weapons: [{ weaponId: 7001, count: 2 }],
      },
    },
    metadata: {
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 1 },
      perfectCounts: { total: 1, byXuid: { "333": 1 } },
    },
    ...overrides,
  };
}
