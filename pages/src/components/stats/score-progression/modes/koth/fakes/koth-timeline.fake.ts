import type { KothTimeline } from "@guilty-spark/shared/contracts/stats/match-analytics";

// Hill 1: team 0 holds the full period (0→30000); team 0 captured at t=30000.
// Hill 2: team 1 holds the full period (30000→55000); team 1 captured at t=55000.
// Capture timestamps must match a score event because buildHillCaptureTimestamps
// always uses the capturing team's last score event timestamp.
export function aFakeKothTimelineWith(overrides: Partial<KothTimeline> = {}): KothTimeline {
  return {
    type: "koth",
    events: [
      { timestampMs: 2500, teamId: 0, runningScores: { "0": 1, "1": 0 } },
      { timestampMs: 5000, teamId: 0, runningScores: { "0": 2, "1": 0 } },
      { timestampMs: 12500, teamId: 1, runningScores: { "0": 2, "1": 1 } },
      { timestampMs: 20000, teamId: 0, runningScores: { "0": 3, "1": 1 } },
      { timestampMs: 30000, teamId: 0, runningScores: { "0": 4, "1": 1 } },
      { timestampMs: 32500, teamId: 1, runningScores: { "0": 4, "1": 2 } },
      { timestampMs: 45000, teamId: 1, runningScores: { "0": 4, "1": 3 } },
      { timestampMs: 55000, teamId: 1, runningScores: { "0": 4, "1": 4 } },
    ],
    controlPeriods: [
      { startMs: 0, endMs: 30000, controllingTeamId: 0 },
      { startMs: 30000, endMs: 60000, controllingTeamId: 1 },
    ],
    hillCaptureTimestamps: [30000, 55000],
    ...overrides,
  };
}
