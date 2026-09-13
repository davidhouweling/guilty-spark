import type { ScoreLinesViewData } from "../types";

export function aFakeScoreLinesViewDataWith(overrides: Partial<ScoreLinesViewData> = {}): ScoreLinesViewData {
  return {
    kind: "score-lines",
    durationMs: 600000,
    teamLines: [],
    scoreDelta: null,
    playerAdvantage: null,
    markers: null,
    zoneAdvantage: null,
    roundBoundaries: [],
    ...overrides,
  };
}
