import type { CtfFlagRun } from "@guilty-spark/shared/contracts/stats/match-analytics";

export function aFakeCtfFlagRunWith(overrides: Partial<CtfFlagRun> = {}): CtfFlagRun {
  return {
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
    ...overrides,
  };
}
