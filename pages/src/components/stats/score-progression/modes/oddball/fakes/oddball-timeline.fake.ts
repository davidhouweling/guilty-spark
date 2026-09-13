import type { OddballTimeline } from "@guilty-spark/shared/contracts/stats/match-analytics";

// Round 1 (0→330000, timed out): team 0 carries twice, team 1 once; team 0 wins 20:10.
// Round 2 (342000→460000, capped): team 1 carries through to the cap.
export function aFakeOddballTimelineWith(overrides: Partial<OddballTimeline> = {}): OddballTimeline {
  return {
    type: "oddball",
    rounds: [
      {
        roundIndex: 0,
        startMs: 0,
        endMs: 330000,
        endedByCap: false,
        winnerTeamId: 0,
        scores: { "0": 20, "1": 10 },
        carrySegments: [
          { startMs: 5000, endMs: 20000, teamId: 0 },
          { startMs: 25000, endMs: 30000, teamId: 0 },
          { startMs: 40000, endMs: 50000, teamId: 1 },
        ],
        points: [
          { timestampMs: 5000, runningScores: { "0": 0, "1": 0 } },
          { timestampMs: 20000, runningScores: { "0": 15, "1": 0 } },
          { timestampMs: 30000, runningScores: { "0": 20, "1": 0 } },
          { timestampMs: 50000, runningScores: { "0": 20, "1": 10 } },
        ],
      },
      {
        roundIndex: 1,
        startMs: 342000,
        endMs: 460000,
        endedByCap: true,
        winnerTeamId: 1,
        scores: { "0": 0, "1": 100 },
        carrySegments: [{ startMs: 345000, endMs: 460000, teamId: 1 }],
        points: [
          { timestampMs: 345000, runningScores: { "0": 0, "1": 0 } },
          { timestampMs: 402500, runningScores: { "0": 0, "1": 50 } },
          { timestampMs: 460000, runningScores: { "0": 0, "1": 100 } },
        ],
      },
    ],
    deathTimeline: [
      { timestampMs: 15000, teamId: 1 },
      { timestampMs: 60000, teamId: 0 },
    ],
    respawnDurationMs: 8000,
    ...overrides,
  };
}
