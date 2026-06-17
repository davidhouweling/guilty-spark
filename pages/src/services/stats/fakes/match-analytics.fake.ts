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
  readonly failMatchIds: readonly string[];
}

export class FakeMatchAnalyticsService implements MatchAnalyticsService {
  private readonly analytics: MatchAnalytics;
  private readonly failMatchIds: ReadonlySet<string>;

  constructor(options: Partial<FakeMatchAnalyticsServiceOptions> = {}) {
    this.analytics = options.analytics ?? aFakeMatchAnalyticsWith();
    this.failMatchIds = new Set(options.failMatchIds ?? []);
  }

  async getMatchAnalytics(matchId: string, modules?: readonly AnalyticsModule[]): Promise<MatchAnalytics> {
    void modules;
    if (this.failMatchIds.has(matchId)) {
      return Promise.reject(new Error(`Analytics fetch failed for ${matchId}`));
    }
    return Promise.resolve(this.analytics);
  }

  async getBatchMatchAnalytics(
    matchIds: readonly string[],
    modules?: readonly AnalyticsModule[],
  ): Promise<Record<string, MatchAnalytics | null>> {
    void modules;
    const results: Record<string, MatchAnalytics | null> = {};
    for (const matchId of matchIds) {
      results[matchId] = this.failMatchIds.has(matchId) ? null : this.analytics;
    }
    return Promise.resolve(results);
  }
}

export function aFakeMatchAnalyticsServiceWith(
  overrides: Partial<FakeMatchAnalyticsServiceOptions> = {},
): FakeMatchAnalyticsService {
  return new FakeMatchAnalyticsService(overrides);
}
