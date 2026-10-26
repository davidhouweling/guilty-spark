import type { FlagAdvantageOverlay } from "../types";

export function aFakeFlagAdvantageOverlayWith(overrides: Partial<FlagAdvantageOverlay> = {}): FlagAdvantageOverlay {
  return {
    minScore: 0,
    maxScore: 1,
    rows: [
      { timestampMs: 0, run1: null, playerAdvantage: 0 },
      { timestampMs: 20000, run1: 0, playerAdvantage: 0 },
      { timestampMs: 30000, run1: 25, playerAdvantage: 1 },
      { timestampMs: 45000, run1: 60, playerAdvantage: 1 },
      { timestampMs: 60000, run1: 100, playerAdvantage: 1 },
      { timestampMs: 120000, run1: null, playerAdvantage: 1 },
    ],
    ...overrides,
  };
}
