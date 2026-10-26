import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FlagRunsChart } from "../flag-runs-chart";
import { aFakeFlagRunDataWith } from "../../fakes/flag-run-data.fake";
import { aFakeFlagRunsChartViewModelWith } from "../../fakes/flag-runs-view-model.fake";

afterEach(() => {
  cleanup();
});

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }): React.ReactElement => <div>{children}</div>,
  AreaChart: ({ children, data }: { children: React.ReactNode; data?: readonly unknown[] }): React.ReactElement => (
    <div data-testid="area-chart" data-rows={data?.length}>
      {children}
    </div>
  ),
  CartesianGrid: (): null => null,
  ReferenceLine: ({
    y,
    segment,
  }: {
    y?: number;
    segment?: readonly { x: number; y: number }[];
  }): React.ReactElement => (
    <div
      data-testid="reference-line"
      data-y={y}
      data-segment={segment?.map((point) => `${String(point.x)}:${String(point.y)}`).join(" ")}
    />
  ),
  ReferenceDot: ({ x, y }: { x: number; y: number }): React.ReactElement => (
    <div data-testid="reference-dot" data-x={x} data-y={y} />
  ),
  XAxis: (): null => null,
  YAxis: ({ yAxisId, domain }: { yAxisId?: string; domain?: readonly [number, number] }): React.ReactElement => (
    <div data-testid="y-axis" data-axis={yAxisId} data-domain={domain?.join(",")} />
  ),
  Tooltip: (): null => null,
  Area: ({ name, stroke, dataKey }: { name: string; stroke: string; dataKey: string }): React.ReactElement => (
    <div data-testid="area" data-stroke={stroke} data-key={dataKey}>
      {name}
    </div>
  ),
}));

function resetSegments(): string[] {
  return screen
    .getAllByTestId("reference-line")
    .map((line) => line.getAttribute("data-segment"))
    .filter((segment): segment is string => segment != null);
}

describe("FlagRunsChart", () => {
  it("renders one area per run over the shared rows, in the carrier colour on a mirrored axis", () => {
    render(<FlagRunsChart {...aFakeFlagRunsChartViewModelWith()} />);

    const areas = screen.getAllByTestId("area");
    expect(areas).toHaveLength(1);
    expect(areas[0]).toHaveTextContent("Eagle flag · Cobra carrying");
    expect(areas[0]).toHaveAttribute("data-stroke", "#ff0000");
    expect(areas[0]).toHaveAttribute("data-key", "run1");
    expect(screen.getByTestId("area-chart")).toHaveAttribute("data-rows", "4");
    expect(screen.getByTestId("y-axis")).toHaveAttribute("data-domain", "-100,100");
  });

  it("renders a marker per flag event and a reset segment back to the home line", () => {
    render(<FlagRunsChart {...aFakeFlagRunsChartViewModelWith()} />);

    const dots = screen.getAllByTestId("reference-dot");
    expect(dots.map((dot) => dot.getAttribute("data-y"))).toEqual(["0", "25", "100"]);
    expect(resetSegments()).toEqual(["60000:100 60000:0"]);
  });

  it("renders the player advantage as a named area on its own mirrored axis", () => {
    const playerAdvantage = {
      points: [
        { timestampMs: 0, score: 0 },
        { timestampMs: 40000, score: -1 },
      ],
      minScore: -1,
      maxScore: 0,
    };
    render(<FlagRunsChart {...aFakeFlagRunsChartViewModelWith({ playerAdvantage, advantageDomain: [-1, 1] })} />);

    const areaNames = screen.getAllByTestId("area").map((area) => area.textContent);
    expect(areaNames).toEqual(["Eagle flag · Cobra carrying", "Player Advantage"]);
    const advantageAxes = screen.getAllByTestId("y-axis").filter((axis) => axis.getAttribute("data-axis") != null);
    expect(advantageAxes).toHaveLength(1);
    expect(advantageAxes[0]).toHaveAttribute("data-domain", "-1,1");
  });

  it("renders no advantage axis or area while the overlay is off", () => {
    render(<FlagRunsChart {...aFakeFlagRunsChartViewModelWith()} />);

    expect(screen.getAllByTestId("y-axis")).toHaveLength(1);
    expect(screen.getAllByTestId("area")).toHaveLength(1);
  });

  it("renders no reset segment or markers for a run cut off by the match end", () => {
    render(
      <FlagRunsChart
        {...aFakeFlagRunsChartViewModelWith({ runs: [aFakeFlagRunDataWith({ reset: null, markers: [] })] })}
      />,
    );

    expect(resetSegments()).toEqual([]);
    expect(screen.queryAllByTestId("reference-dot")).toHaveLength(0);
  });
});
