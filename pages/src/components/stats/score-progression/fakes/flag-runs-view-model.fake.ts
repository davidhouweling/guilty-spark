import type { FlagRunsChartViewModel, FlagRunsViewModel } from "../types";
import { buildFlagHomeLinePoints, buildFlagRunsChartPoints } from "../modes/ctf/ctf-view-model";
import { aFakeFlagRunDataWith } from "./flag-run-data.fake";

export function aFakeFlagRunsChartViewModelWith(
  overrides: Partial<FlagRunsChartViewModel> = {},
): FlagRunsChartViewModel {
  const runs = overrides.runs ?? [aFakeFlagRunDataWith()];
  return {
    durationMs: 120000,
    runs,
    points: runs.length === 0 ? buildFlagHomeLinePoints(120000) : buildFlagRunsChartPoints(runs),
    advantageDomain: null,
    showTooltip: true,
    tooltipFormatter: (value): [string, string] => [String(value ?? ""), ""],
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
    hasPlayerAdvantage: false,
    showPlayerAdvantage: false,
    chart: aFakeFlagRunsChartViewModelWith(),
    onChartTypeChange: (): void => undefined,
    onPlayerAdvantageChange: (): void => undefined,
    ...overrides,
  };
}
