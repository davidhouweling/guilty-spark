import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FlagRunsCharts } from "../flag-runs-charts";
import { aFakeFlagRunsViewModelWith } from "../../fakes/flag-runs-view-model.fake";

afterEach(() => {
  cleanup();
});

vi.mock("../../flag-runs-chart/flag-runs-chart", () => ({
  FlagRunsChart: (): React.ReactElement => <div data-testid="flag-runs-chart" />,
}));

describe("FlagRunsCharts", () => {
  it("renders the chart with both legends and no select when only flag runs are available", () => {
    render(<FlagRunsCharts {...aFakeFlagRunsViewModelWith()} />);

    expect(screen.getByTestId("flag-runs-chart")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "flag chart" })).toBeInTheDocument();
    expect(screen.getByText("Above: Eagle's flag, carried by Cobra")).toBeInTheDocument();
    expect(screen.getByText("Carrier killed")).toBeInTheDocument();
    expect(screen.queryByLabelText("Chart type")).not.toBeInTheDocument();
  });

  it("shows the chart type select when score charts are available", () => {
    render(
      <FlagRunsCharts
        {...aFakeFlagRunsViewModelWith({
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
