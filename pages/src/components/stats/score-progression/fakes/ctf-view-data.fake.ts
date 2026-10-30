import type { CtfViewData } from "../types";
import { buildFlagChartPoints } from "../modes/ctf/ctf-view-model";
import { aFakeFlagRunDataWith } from "./flag-run-data.fake";

export function aFakeCtfViewDataWith(overrides: Partial<CtfViewData> = {}): CtfViewData {
  const runs = overrides.runs ?? [aFakeFlagRunDataWith()];
  const durationMs = overrides.durationMs ?? 120000;
  return {
    kind: "ctf",
    durationMs,
    runs,
    points: buildFlagChartPoints(runs, durationMs),
    legend: [
      { key: "flag-1", color: "#0000ff", text: "Above: Cobra's flag, carried by Eagle" },
      { key: "flag-0", color: "#ff0000", text: "Below: Eagle's flag, carried by Cobra" },
    ],
    teamNames: ["Eagle", "Cobra"],
    advantageOverlay: null,
    scoreLines: null,
    ...overrides,
  };
}
