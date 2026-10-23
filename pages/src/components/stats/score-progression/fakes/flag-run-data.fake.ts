import type { FlagRunData } from "../types";

export function aFakeFlagRunDataWith(overrides: Partial<FlagRunData> = {}): FlagRunData {
  return {
    runIndex: 1,
    seriesName: "Eagle flag · Cobra carrying",
    color: "#ff0000",
    points: [
      { timestampMs: 20000, progress: 0 },
      { timestampMs: 30000, progress: 25 },
      { timestampMs: 45000, progress: 60 },
      { timestampMs: 60000, progress: 100 },
    ],
    markers: [
      { timestampMs: 20000, progress: 0, kind: "steal" },
      { timestampMs: 30000, progress: 25, kind: "grab" },
      { timestampMs: 60000, progress: 100, kind: "capture" },
    ],
    reset: { timestampMs: 60000, fromProgress: 100 },
    ...overrides,
  };
}
