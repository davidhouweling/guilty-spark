import type { KothHillData } from "../types";

export function aFakeKothHillDataWith(overrides: Partial<KothHillData> = {}): KothHillData {
  return {
    hillIndex: 1,
    startMs: 0,
    endMs: 30000,
    segments: [
      { startMs: 0, endMs: 15000, teamId: 0, color: "#0000ff" },
      { startMs: 15000, endMs: 25000, teamId: 1, color: "#ff0000" },
      { startMs: 25000, endMs: 30000, teamId: null, color: null },
    ],
    winnerTeamId: 1,
    winnerColor: "#ff0000",
    winnerName: "Cobra",
    teamOccupancies: [
      { teamId: 0, name: "Eagle", color: "#0000ff", percentage: 50 },
      { teamId: 1, name: "Cobra", color: "#ff0000", percentage: 33 },
    ],
    ...overrides,
  };
}
