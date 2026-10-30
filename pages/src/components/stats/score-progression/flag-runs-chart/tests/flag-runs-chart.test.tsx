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
  YAxis: ({
    yAxisId,
    domain,
    tickFormatter,
  }: {
    yAxisId?: string;
    domain?: readonly [number, number];
    tickFormatter?: (value: number) => string;
  }): React.ReactElement => (
    <div data-testid="y-axis" data-axis={yAxisId} data-domain={domain?.join(",")} data-tick={tickFormatter?.(-2)} />
  ),
  Tooltip: (): React.ReactElement => <div data-testid="tooltip" />,
  Area: ({
    name,
    stroke,
    dataKey,
    yAxisId,
  }: {
    name: string;
    stroke: string;
    dataKey: string;
    yAxisId?: string;
  }): React.ReactElement => (
    <div data-testid="area" data-stroke={stroke} data-key={dataKey} data-axis={yAxisId}>
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
    expect(screen.getByTestId("tooltip")).toBeInTheDocument();
    expect(screen.getByTestId("area-chart")).toHaveAttribute("data-rows", "4");
    expect(screen.getByTestId("y-axis")).toHaveAttribute("data-domain", "-100,100");
  });

  it("renders the axes and home line over the seeded rows, with no areas, markers or tooltip, when there are no runs", () => {
    render(<FlagRunsChart {...aFakeFlagRunsChartViewModelWith({ runs: [], showTooltip: false })} />);

    expect(screen.queryAllByTestId("area")).toHaveLength(0);
    expect(screen.queryAllByTestId("reference-dot")).toHaveLength(0);
    expect(screen.queryByTestId("tooltip")).toBeNull();
    expect(screen.getByTestId("area-chart")).toHaveAttribute("data-rows", "2");
    expect(screen.getByTestId("y-axis")).toHaveAttribute("data-domain", "-100,100");
    expect(screen.getByTestId("reference-line")).toHaveAttribute("data-y", "0");
  });

  it("renders a marker per flag event and a reset segment back to the home line", () => {
    render(<FlagRunsChart {...aFakeFlagRunsChartViewModelWith()} />);

    const dots = screen.getAllByTestId("reference-dot");
    expect(dots.map((dot) => dot.getAttribute("data-y"))).toEqual(["0", "-25", "-100"]);
    expect(resetSegments()).toEqual(["60000:-100 60000:0"]);
  });

  it("renders the player advantage from the shared rows as a named area on its own mirrored axis", () => {
    const points = [
      { timestampMs: 0, run1: null, playerAdvantage: 0 },
      { timestampMs: 20000, run1: 0, playerAdvantage: 0 },
      { timestampMs: 30000, run1: -25, playerAdvantage: -1 },
      { timestampMs: 45000, run1: -60, playerAdvantage: -1 },
      { timestampMs: 60000, run1: -100, playerAdvantage: -1 },
      { timestampMs: 120000, run1: null, playerAdvantage: -1 },
    ];
    render(<FlagRunsChart {...aFakeFlagRunsChartViewModelWith({ points, advantageDomain: [-1, 1] })} />);

    expect(screen.getByTestId("area-chart")).toHaveAttribute("data-rows", "6");
    const areas = screen.getAllByTestId("area");
    expect(areas.map((area) => area.textContent)).toEqual(["Eagle flag · Cobra carrying", "Player Advantage"]);
    expect(areas[1]).toHaveAttribute("data-key", "playerAdvantage");
    expect(areas[1]).toHaveAttribute("data-axis", "advantage");
    expect(areas[0]).not.toHaveAttribute("data-axis");
    const advantageAxes = screen.getAllByTestId("y-axis").filter((axis) => axis.getAttribute("data-axis") != null);
    expect(advantageAxes).toHaveLength(1);
    expect(advantageAxes[0]).toHaveAttribute("data-domain", "-1,1");
    expect(advantageAxes[0]).toHaveAttribute("data-tick", "2");
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
