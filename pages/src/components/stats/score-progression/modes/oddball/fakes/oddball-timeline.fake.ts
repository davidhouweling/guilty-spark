import type { OddballTimeline } from "@guilty-spark/shared/contracts/stats/match-analytics";

// Round 1 (0→330000, timed out): team 0 carries 10000→30000 (5s crossings), team 1 carries
// 45000→55000; team 0 wins 20:10. Round 2 (342000→460000, capped): team 1 rides the meter to
// 100 with a final crossing at the round end.
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
        events: [
          { timestampMs: 10000, teamId: 0, runningScores: { "0": 5, "1": 0 } },
          { timestampMs: 15000, teamId: 0, runningScores: { "0": 10, "1": 0 } },
          { timestampMs: 20000, teamId: 0, runningScores: { "0": 15, "1": 0 } },
          { timestampMs: 30000, teamId: 0, runningScores: { "0": 20, "1": 0 } },
          { timestampMs: 45000, teamId: 1, runningScores: { "0": 20, "1": 5 } },
          { timestampMs: 50000, teamId: 1, runningScores: { "0": 20, "1": 10 } },
        ],
      },
      {
        roundIndex: 1,
        startMs: 342000,
        endMs: 460000,
        endedByCap: true,
        winnerTeamId: 1,
        scores: { "0": 0, "1": 100 },
        events: [
          { timestampMs: 400000, teamId: 1, runningScores: { "0": 0, "1": 50 } },
          { timestampMs: 405000, teamId: 1, runningScores: { "0": 0, "1": 55 } },
          { timestampMs: 460000, teamId: 1, runningScores: { "0": 0, "1": 100 } },
        ],
      },
    ],
    ...overrides,
  };
}
