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
    zoneEvents: [
      { timestampMs: 10000, teamId: 0, kind: "capture" },
      { timestampMs: 50000, teamId: 1, kind: "capture" },
      { timestampMs: 70000, teamId: 0, kind: "secure" },
    ],
    zoneTimeline: [
      { timestampMs: 0, zoneCounts: { "0": 1, "1": 1 } },
      { timestampMs: 10000, zoneCounts: { "0": 2, "1": 1 } },
      { timestampMs: 50000, zoneCounts: { "0": 1, "1": 2 } },
    ],
    deathTimeline: [
      { timestampMs: 20000, teamId: 1 },
      { timestampMs: 55000, teamId: 0 },
    ],
    respawnDurationMs: 8000,
    ...overrides,
  };
}
