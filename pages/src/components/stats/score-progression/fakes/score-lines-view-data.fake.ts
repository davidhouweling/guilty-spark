import type { ScoreLinesViewData } from "../types";
import { SCORE_SCALE } from "../score-progression-formatter";

export function aFakeScoreLinesViewDataWith(overrides: Partial<ScoreLinesViewData> = {}): ScoreLinesViewData {
  return {
    kind: "score-lines",
    durationMs: 600000,
    scoreScale: SCORE_SCALE,
    teamLines: [],
    scoreDelta: null,
    playerAdvantage: null,
    markers: null,
    zoneAdvantage: null,
    roundBoundaries: [],
    ...overrides,
  };
}
