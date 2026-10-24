import type { CtfTimeline } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { aFakeCtfFlagRunWith } from "./ctf-flag-run.fake";

export function aFakeCtfTimelineWith(overrides: Partial<CtfTimeline> = {}): CtfTimeline {
  return {
    type: "ctf",
    events: [{ timestampMs: 60000, teamId: 1, runningScores: { "0": 0, "1": 1 } }],
    runs: [
      aFakeCtfFlagRunWith(),
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
