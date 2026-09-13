import type { StrongholdsTimeline } from "@guilty-spark/shared/contracts/stats/match-analytics";

// Team 0 ramps to 60 holding two zones; team 1 trails to 25.
export function aFakeStrongholdsTimelineWith(overrides: Partial<StrongholdsTimeline> = {}): StrongholdsTimeline {
  return {
    type: "strongholds",
    events: [
      { timestampMs: 10000, runningScores: { "0": 0, "1": 0 } },
      { timestampMs: 40000, runningScores: { "0": 30, "1": 0 } },
      { timestampMs: 60000, runningScores: { "0": 30, "1": 20 } },
      { timestampMs: 90000, runningScores: { "0": 60, "1": 25 } },
    ],
    ...overrides,
  };
}
