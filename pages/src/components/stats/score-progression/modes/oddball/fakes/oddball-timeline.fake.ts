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
      },
      {
        roundIndex: 1,
        startMs: 342000,
        endMs: 460000,
        endedByCap: true,
        winnerTeamId: 1,
        scores: { "0": 0, "1": 100 },
        carrySegments: [{ startMs: 345000, endMs: 460000, teamId: 1 }],
      },
    ],
    ...overrides,
  };
}
