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
          { weaponId: "6001000042C9679F", name: "BR75", count: 1 },
          { weaponId: "5001000042C9679F", name: "MA40 AR", count: 2 },
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
        weapons: [{ weaponId: "7001000042C9679F", name: "Energy Sword", count: 2 }],
      },
    },
    metadata: {
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 1 },
      perfectCounts: { total: 1, byXuid: { "333": 1 } },
    },
    scoreProgression: null,
    ...overrides,
  };
}
