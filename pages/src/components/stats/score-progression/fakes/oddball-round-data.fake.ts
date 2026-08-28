import type { OddballRoundData } from "../types";

export function aFakeOddballRoundDataWith(overrides: Partial<OddballRoundData> = {}): OddballRoundData {
  return {
    roundIndex: 1,
    startMs: 0,
    endMs: 330000,
    endedByCap: false,
    segments: [
      { startMs: 0, endMs: 15000, teamId: 0, color: "#0000ff" },
      { startMs: 15000, endMs: 25000, teamId: 1, color: "#ff0000" },
      { startMs: 25000, endMs: 330000, teamId: null, color: null },
    ],
    winnerTeamId: 0,
    winnerColor: "#0000ff",
    winnerName: "Eagle",
    teamScores: [
      { teamId: 0, name: "Eagle", color: "#0000ff", score: 64 },
      { teamId: 1, name: "Cobra", color: "#ff0000", score: 28 },
    ],
    ...overrides,
  };
}
