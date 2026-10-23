import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FlagRunsCharts } from "../flag-runs-charts";
import { aFakeFlagRunDataWith } from "../../fakes/flag-run-data.fake";
import type { FlagRunsViewModel } from "../../types";

afterEach(() => {
  cleanup();
});

vi.mock("../../flag-runs-chart/flag-runs-chart", () => ({
  FlagRunsChart: (): React.ReactElement => <div data-testid="flag-runs-chart" />,
}));

function aFlagRunsViewModelWith(overrides: Partial<FlagRunsViewModel> = {}): FlagRunsViewModel {
  return {
    kind: "flag-runs",
    ariaLabel: "flag chart",
    effectiveChartType: "timeline",
    chartTypeOptions: [{ value: "timeline", label: "Flag Runs" }],
    showChartTypeSelect: false,
    legend: [{ key: "flag-0", color: "#ff0000", text: "Above: Eagle's flag, carried by Cobra" }],
    markerLegend: [{ kind: "drop", symbol: "✕", text: "Carrier killed" }],
    chart: {
      durationMs: 120000,
      runs: [aFakeFlagRunDataWith()],
      tooltipFormatter: (value: unknown): [string, string] => [String(value), ""],
    },
    onChartTypeChange: (): void => undefined,
    ...overrides,
  };
}

describe("FlagRunsCharts", () => {
  it("renders the chart with both legends and no select when only flag runs are available", () => {
    render(<FlagRunsCharts {...aFlagRunsViewModelWith()} />);

    expect(screen.getByTestId("flag-runs-chart")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "flag chart" })).toBeInTheDocument();
    expect(screen.getByText("Above: Eagle's flag, carried by Cobra")).toBeInTheDocument();
    expect(screen.getByText("Carrier killed")).toBeInTheDocument();
    expect(screen.queryByLabelText("Chart type")).not.toBeInTheDocument();
  });

  it("shows the chart type select when score charts are available", () => {
    render(
      <FlagRunsCharts
        {...aFlagRunsViewModelWith({
          showChartTypeSelect: true,
          chartTypeOptions: [
            { value: "timeline", label: "Flag Runs" },
            { value: "progression", label: "Score Progression" },
          ],
        })}
      />,
    );

    expect(screen.getByLabelText("Chart type")).toBeInTheDocument();
  });
});
