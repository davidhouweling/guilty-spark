import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";

export function aFakeScoreProgressionWith(
  overrides: Partial<NonNullable<MatchAnalytics["scoreProgression"]>> = {},
): NonNullable<MatchAnalytics["scoreProgression"]> {
  return {
    mode: 9,
    durationMs: 600000,
    teamCount: 2,
    respawnDurationMs: 8000,
    timeline: {
      type: "kill-race",
      events: [
        { timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } },
        { timestampMs: 12000, teamId: 1, runningScores: { "0": 1, "1": 1 } },
        { timestampMs: 20000, teamId: 0, runningScores: { "0": 2, "1": 1 } },
      ],
      deathTimeline: [
        { timestampMs: 5001, teamId: 1 },
        { timestampMs: 12001, teamId: 0 },
        { timestampMs: 20001, teamId: 1 },
      ],
    },
    ...overrides,
  };
}
