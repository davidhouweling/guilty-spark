import type { FlagRunsChartViewModel, FlagRunsViewModel } from "../types";
import { aFakeFlagRunDataWith } from "./flag-run-data.fake";

export function aFakeFlagRunsChartViewModelWith(
  overrides: Partial<FlagRunsChartViewModel> = {},
): FlagRunsChartViewModel {
  return {
    durationMs: 120000,
    runs: [aFakeFlagRunDataWith()],
    points: [
      { timestampMs: 20000, run1: 0 },
      { timestampMs: 30000, run1: 25 },
      { timestampMs: 45000, run1: 60 },
      { timestampMs: 60000, run1: 100 },
    ],
    tooltipFormatter: (value: unknown): [string, string] => [String(value), ""],
    ...overrides,
  };
}

export function aFakeFlagRunsViewModelWith(overrides: Partial<FlagRunsViewModel> = {}): FlagRunsViewModel {
  return {
    kind: "flag-runs",
    ariaLabel: "flag chart",
    effectiveChartType: "timeline",
    chartTypeOptions: [{ value: "timeline", label: "Flag Runs" }],
    showChartTypeSelect: false,
    legend: [{ key: "flag-0", color: "#ff0000", text: "Above: Eagle's flag, carried by Cobra" }],
    markerLegend: [{ kind: "drop", text: "Carrier killed" }],
    chart: aFakeFlagRunsChartViewModelWith(),
    onChartTypeChange: (): void => undefined,
    ...overrides,
  };
}
