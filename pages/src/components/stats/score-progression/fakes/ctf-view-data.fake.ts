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
      { key: "flag-0", color: "#ff0000", text: "Above: Eagle's flag, carried by Cobra" },
      { key: "flag-1", color: "#0000ff", text: "Below: Cobra's flag, carried by Eagle" },
    ],
    teamNames: ["Eagle", "Cobra"],
    advantageOverlay: null,
    scoreLines: null,
    ...overrides,
  };
}
