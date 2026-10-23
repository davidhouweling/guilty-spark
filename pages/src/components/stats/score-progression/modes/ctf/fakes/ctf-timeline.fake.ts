import type { CtfTimeline } from "@guilty-spark/shared/contracts/stats/match-analytics";

export function aFakeCtfTimelineWith(overrides: Partial<CtfTimeline> = {}): CtfTimeline {
  return {
    type: "ctf",
    events: [{ timestampMs: 60000, teamId: 1, runningScores: { "0": 0, "1": 1 } }],
    runs: [
      {
        flagTeamId: 0,
        carrierTeamId: 1,
        startMs: 20000,
        endMs: 60000,
        outcome: "capture",
        samples: [
          { timestampMs: 30000, progress: 0.25 },
          { timestampMs: 45000, progress: 0.6 },
        ],
        events: [
          { timestampMs: 20000, kind: "steal" },
          { timestampMs: 30000, kind: "grab" },
          { timestampMs: 60000, kind: "capture" },
        ],
      },
      {
        flagTeamId: 1,
        carrierTeamId: 0,
        startMs: 70000,
        endMs: 100000,
        outcome: "return",
        samples: [
          { timestampMs: 80000, progress: 0.5 },
          { timestampMs: 90000, progress: 0.86 },
        ],
        events: [
          { timestampMs: 70000, kind: "steal" },
          { timestampMs: 90000, kind: "drop" },
          { timestampMs: 100000, kind: "return" },
        ],
      },
    ],
    deathTimeline: [
      { timestampMs: 40000, teamId: 0 },
      { timestampMs: 90000, teamId: 0 },
    ],
    respawnDurationMs: 8000,
    ...overrides,
  };
}
