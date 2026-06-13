import type { AnalyticsModule, MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { MatchAnalyticsService } from "../match-analytics-types";

function aFakeMatchAnalyticsWith(overrides: Partial<MatchAnalytics> = {}): MatchAnalytics {
  return {
    requestedModules: ["killMatrix"],
    killMatrix: {
      "2533274844642438:2533274881185517": {
        count: 2,
        headshotKills: 1,
        perfects: 0,
        weapons: [],
      },
    },
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
    ...overrides,
  };
}

interface FakeMatchAnalyticsServiceOptions {
  readonly analytics: MatchAnalytics;
}

export class FakeMatchAnalyticsService implements MatchAnalyticsService {
  private readonly analytics: MatchAnalytics;

  constructor(options: Partial<FakeMatchAnalyticsServiceOptions> = {}) {
    this.analytics = options.analytics ?? aFakeMatchAnalyticsWith();
  }

  async getMatchAnalytics(matchId: string, modules?: readonly AnalyticsModule[]): Promise<MatchAnalytics> {
    void matchId;
    void modules;
    return Promise.resolve(this.analytics);
  }
}

export function aFakeMatchAnalyticsServiceWith(
  overrides: Partial<FakeMatchAnalyticsServiceOptions> = {},
): FakeMatchAnalyticsService {
  return new FakeMatchAnalyticsService(overrides);
}
