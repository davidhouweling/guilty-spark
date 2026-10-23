import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FlagRunsChart } from "../flag-runs-chart";
import { aFakeFlagRunDataWith } from "../../fakes/flag-run-data.fake";
import type { FlagRunsChartViewModel } from "../../types";

afterEach(() => {
  cleanup();
});

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }): React.ReactElement => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }): React.ReactElement => <div>{children}</div>,
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
      data-segment={segment?.map((p) => `${String(p.x)}:${String(p.y)}`).join(" ")}
    />
  ),
  ReferenceDot: ({ x, y }: { x: number; y: number }): React.ReactElement => (
    <div data-testid="reference-dot" data-x={x} data-y={y} />
  ),
  XAxis: (): null => null,
  YAxis: ({ domain }: { domain?: readonly [number, number] }): React.ReactElement => (
    <div data-testid="y-axis" data-domain={domain?.join(",")} />
  ),
  Tooltip: (): null => null,
  Area: ({ name, stroke }: { name: string; stroke: string }): React.ReactElement => (
    <div data-testid="area" data-stroke={stroke}>
      {name}
    </div>
  ),
}));

function aChartModelWith(overrides: Partial<FlagRunsChartViewModel> = {}): FlagRunsChartViewModel {
  return {
    durationMs: 120000,
    runs: [aFakeFlagRunDataWith()],
    tooltipFormatter: (value: unknown): [string, string] => [String(value), ""],
    ...overrides,
  };
}

describe("FlagRunsChart", () => {
  it("renders one area per run in the carrier colour on a mirrored axis", () => {
    render(<FlagRunsChart {...aChartModelWith()} />);

    const areas = screen.getAllByTestId("area");
    expect(areas).toHaveLength(1);
    expect(areas[0]).toHaveTextContent("Eagle flag · Cobra carrying");
    expect(areas[0]).toHaveAttribute("data-stroke", "#ff0000");
    expect(screen.getByTestId("y-axis")).toHaveAttribute("data-domain", "-100,100");
  });

  it("renders a marker per flag event and a reset segment back to the home line", () => {
    render(<FlagRunsChart {...aChartModelWith()} />);

    const dots = screen.getAllByTestId("reference-dot");
    expect(dots.map((dot) => dot.getAttribute("data-y"))).toEqual(["0", "25", "100"]);
    const segments = screen
      .getAllByTestId("reference-line")
      .map((line) => line.getAttribute("data-segment"))
      .filter((segment) => segment != null);
    expect(segments).toEqual(["60000:100 60000:0"]);
  });

  it("renders no reset segment for a run cut off by the match end", () => {
    render(<FlagRunsChart {...aChartModelWith({ runs: [aFakeFlagRunDataWith({ reset: null, markers: [] })] })} />);

    const segments = screen
      .getAllByTestId("reference-line")
      .map((line) => line.getAttribute("data-segment"))
      .filter((segment) => segment != null);
    expect(segments).toEqual([]);
    expect(screen.queryAllByTestId("reference-dot")).toHaveLength(0);
  });
});
