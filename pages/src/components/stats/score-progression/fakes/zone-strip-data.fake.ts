import type { ZoneStripData } from "../types";

export function aFakeZoneStripDataWith(overrides: Partial<ZoneStripData> = {}): ZoneStripData {
  return {
    segments: [
      { startMs: 0, endMs: 20000, teamId: 0, color: "#0000ff", opacity: 1 },
      { startMs: 20000, endMs: 60000, teamId: null, color: null },
      { startMs: 60000, endMs: 100000, teamId: 1, color: "#ff0000", opacity: 0.4 },
    ],
    teamShares: [
      { teamId: 0, name: "Eagle", color: "#0000ff", percentage: 20 },
      { teamId: 1, name: "Cobra", color: "#ff0000", percentage: 40 },
    ],
    ...overrides,
  };
}
