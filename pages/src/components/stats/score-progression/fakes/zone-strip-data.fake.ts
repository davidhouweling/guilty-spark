import type { ZoneStripData } from "../types";

export function aFakeZoneStripDataWith(overrides: Partial<ZoneStripData> = {}): ZoneStripData {
  return {
    segments: [
      { startMs: 0, endMs: 10000, teamId: null, color: null },
      { startMs: 10000, endMs: 40000, teamId: 0, color: "#0000ff", opacity: 0.7 },
      { startMs: 40000, endMs: 60000, teamId: 1, color: "#ff0000", opacity: 0.7 },
      { startMs: 60000, endMs: 100000, teamId: 0, color: "#0000ff", opacity: 0.7 },
    ],
    teamShares: [
      { teamId: 0, name: "Eagle", color: "#0000ff", leadPercentage: 70 },
      { teamId: 1, name: "Cobra", color: "#ff0000", leadPercentage: 20 },
    ],
    ...overrides,
  };
}
