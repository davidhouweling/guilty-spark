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
    scoreProgression: null,
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

  async getBatchMatchAnalytics(
    matchIds: readonly string[],
    modules?: readonly AnalyticsModule[],
  ): Promise<Record<string, MatchAnalytics | null>> {
    void modules;
    const resultsMap = new Map<string, MatchAnalytics | null>(
      matchIds.map((matchId) => [matchId, this.failMatchIds.has(matchId) ? null : this.analytics]),
    );
    return Promise.resolve(Object.fromEntries(resultsMap));
  }
}

export function aFakeMatchAnalyticsServiceWith(
  overrides: Partial<FakeMatchAnalyticsServiceOptions> = {},
): FakeMatchAnalyticsService {
  return new FakeMatchAnalyticsService(overrides);
}
