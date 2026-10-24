import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { MatchAnalyticsService } from "../match-analytics-types";

export function aFakeCtfScoreProgressionWith(
  overrides: Partial<NonNullable<MatchAnalytics["scoreProgression"]>> = {},
): NonNullable<MatchAnalytics["scoreProgression"]> {
  return {
    mode: 15,
    durationMs: 300000,
    teamCount: 2,
    timeline: {
      type: "ctf",
      events: [{ timestampMs: 95000, teamId: 1, runningScores: { "0": 0, "1": 1 } }],
      runs: [
        {
          flagTeamId: 0,
          carrierTeamId: 1,
          startMs: 40000,
          endMs: 95000,
          outcome: "capture",
          samples: [
            { timestampMs: 50000, progress: 0.15 },
            { timestampMs: 62000, progress: 0.4 },
            { timestampMs: 70000, progress: 0.38 },
            { timestampMs: 84000, progress: 0.72 },
          ],
          events: [
            { timestampMs: 40000, kind: "steal" },
            { timestampMs: 50000, kind: "grab" },
            { timestampMs: 62000, kind: "grab" },
            { timestampMs: 84000, kind: "grab" },
            { timestampMs: 95000, kind: "capture" },
          ],
        },
        {
          flagTeamId: 1,
          carrierTeamId: 0,
          startMs: 120000,
          endMs: 175000,
          outcome: "return",
          samples: [
            { timestampMs: 135000, progress: 0.3 },
            { timestampMs: 150000, progress: 0.62 },
            { timestampMs: 158000, progress: 0.86 },
          ],
          events: [
            { timestampMs: 120000, kind: "steal" },
            { timestampMs: 135000, kind: "grab" },
            { timestampMs: 158000, kind: "drop" },
            { timestampMs: 175000, kind: "return" },
          ],
        },
        {
          flagTeamId: 0,
          carrierTeamId: 1,
          startMs: 250000,
          endMs: 300000,
          outcome: "matchEnd",
          samples: [
            { timestampMs: 265000, progress: 0.2 },
            { timestampMs: 290000, progress: 0.55 },
          ],
          events: [
            { timestampMs: 250000, kind: "steal" },
            { timestampMs: 265000, kind: "grab" },
          ],
        },
      ],
      deathTimeline: [
        { timestampMs: 58000, teamId: 0 },
        { timestampMs: 158000, teamId: 0 },
        { timestampMs: 200000, teamId: 1 },
      ],
      respawnDurationMs: 8000,
    },
    ...overrides,
  };
}

function aFakeMatchAnalyticsWith(overrides: Partial<MatchAnalytics> = {}): MatchAnalytics {
  return {
    requestedModules: ["killMatrix"],
    killMatrix: {
      "2533274844642438:2533274881185517": {
        count: 2,
        perfects: 0,
      },
    },
    scoreProgression: null,
    ...overrides,
  };
}

export function aFakeCtfMatchAnalyticsWith(overrides: Partial<MatchAnalytics> = {}): MatchAnalytics {
  return aFakeMatchAnalyticsWith({
    requestedModules: ["killMatrix", "scoreProgression"],
    scoreProgression: aFakeCtfScoreProgressionWith(),
    ...overrides,
  });
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

  async getBatchMatchAnalytics(matchIds: readonly string[]): Promise<Record<string, MatchAnalytics | null>> {
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
