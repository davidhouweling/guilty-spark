import type { FlagAdvantageData } from "../types";
import { buildFlagRunsChartPoints } from "../modes/ctf/ctf-view-model";
import { aFakeFlagRunDataWith } from "./flag-run-data.fake";

export function aFakeFlagAdvantageDataWith(overrides: Partial<FlagAdvantageData> = {}): FlagAdvantageData {
  return {
    minScore: -1,
    maxScore: 0,
    points: buildFlagRunsChartPoints(
      [aFakeFlagRunDataWith()],
      [
        { timestampMs: 0, score: 0 },
        { timestampMs: 40000, score: -1 },
        { timestampMs: 120000, score: -1 },
      ],
    ),
    ...overrides,
  };
}
