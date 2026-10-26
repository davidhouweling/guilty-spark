import type { CtfViewData } from "../types";
import { buildFlagRunsChartPoints } from "../modes/ctf/ctf-view-model";
import { aFakeFlagRunDataWith } from "./flag-run-data.fake";

export function aFakeCtfViewDataWith(overrides: Partial<CtfViewData> = {}): CtfViewData {
  const runs = [aFakeFlagRunDataWith()];
  return {
    kind: "ctf",
    durationMs: 120000,
    runs,
    points: buildFlagRunsChartPoints(runs),
    legend: [
      { key: "flag-0", color: "#ff0000", text: "Above: Eagle's flag, carried by Cobra" },
      { key: "flag-1", color: "#0000ff", text: "Below: Cobra's flag, carried by Eagle" },
    ],
    teamNames: ["Eagle", "Cobra"],
    playerAdvantage: null,
    scoreLines: null,
    ...overrides,
  };
}
