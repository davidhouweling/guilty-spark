import type { MatchStats } from "halo-infinite-api";
import type { KillMatrixAnalytics } from "../types";

export interface FakeHaloFilmService {
  buildKillMatrixAnalytics: (matchStats: MatchStats) => Promise<KillMatrixAnalytics>;
}

export function aFakeHaloFilmServiceWith(overrides: Partial<FakeHaloFilmService> = {}): FakeHaloFilmService {
  return {
    buildKillMatrixAnalytics: async () =>
      Promise.resolve<KillMatrixAnalytics>({
        entries: [],
        pairingQuality: {
          unpairedDeathCount: 0,
          maxTimeDeltaMs: 0,
        },
        perfectCounts: {
          total: 0,
          byXuid: {},
        },
      }),
    ...overrides,
  };
}
