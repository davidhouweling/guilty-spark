import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ChartFrame } from "../chart-frame";

afterEach(() => {
  cleanup();
});

const options = [
  { value: "timeline", label: "Flag Runs" },
  { value: "progression", label: "Score Progression" },
] as const;

describe("ChartFrame", () => {
  it("renders the chart under an accessible image role without a toolbar when nothing is offered", () => {
    render(
      <ChartFrame
        ariaLabel="chart"
        chartType="timeline"
        chartTypeOptions={options}
        showChartTypeSelect={false}
        onChartTypeChange={(): void => undefined}
      >
        <div data-testid="chart" />
      </ChartFrame>,
    );

    expect(screen.getByRole("img", { name: "chart" })).toContainElement(screen.getByTestId("chart"));
    expect(screen.queryByLabelText("Chart type")).not.toBeInTheDocument();
  });

  it("renders the chart type select, toolbar extras and footer when supplied", () => {
    render(
      <ChartFrame
        ariaLabel="chart"
        chartType="progression"
        chartTypeOptions={options}
        showChartTypeSelect={true}
        toolbarExtras={<span>extras</span>}
        footer={<span>footer</span>}
        onChartTypeChange={(): void => undefined}
      >
        <div />
      </ChartFrame>,
    );

    expect(screen.getByLabelText("Chart type")).toHaveValue("progression");
    expect(screen.getByText("extras")).toBeInTheDocument();
    expect(screen.getByText("footer")).toBeInTheDocument();
  });

  it("shows the toolbar for extras alone", () => {
    render(
      <ChartFrame
        ariaLabel="chart"
        chartType="progression"
        chartTypeOptions={options}
        showChartTypeSelect={false}
        toolbarExtras={<span>extras</span>}
        onChartTypeChange={(): void => undefined}
      >
        <div />
      </ChartFrame>,
    );

    expect(screen.getByText("extras")).toBeInTheDocument();
    expect(screen.queryByLabelText("Chart type")).not.toBeInTheDocument();
  });
});
