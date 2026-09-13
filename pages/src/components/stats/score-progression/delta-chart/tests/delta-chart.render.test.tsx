import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DeltaChart } from "../delta-chart";
import type { ScoreProgressionDeltaViewModel } from "../../types";

afterEach(() => {
  cleanup();
});

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }): React.ReactElement => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }): React.ReactElement => <div>{children}</div>,
  Area: ({ type, name }: { type: string; name?: string }): React.ReactElement => (
    <div data-testid="area" data-type={type} data-name={name ?? "score"} />
  ),
  CartesianGrid: (): null => null,
  ReferenceLine: ({ x }: { x?: number }): React.ReactElement => <div data-testid="reference-line" data-x={x} />,
  Tooltip: (): null => null,
  XAxis: ({ yAxisId }: { yAxisId?: string }): React.ReactElement => <div data-testid="x-axis" data-axis={yAxisId} />,
  YAxis: ({ yAxisId }: { yAxisId?: string }): React.ReactElement => <div data-testid="y-axis" data-axis={yAxisId} />,
  usePlotArea: (): null => null,
  useYAxisScale: (): null => null,
}));

function aDeltaViewModelWith(lineType: "step" | "linear"): ScoreProgressionDeltaViewModel {
  return {
    durationMs: 600000,
    scoreDelta: {
      points: [
        { timestampMs: 0, score: 0 },
        { timestampMs: 600000, score: 5 },
      ],
      minScore: 0,
      maxScore: 5,
      lineType,
    },
    team0Color: "#ff0000",
    team1Color: "#0000ff",
    playerAdvantage: null,
    zoneAdvantage: null,
    advantageDomain: null,
    tooltipFormatter: (value: unknown): [string, string] => [String(value), "Delta"],
  };
}

describe("DeltaChart", () => {
  it("renders the score area stepped for stepped deltas", () => {
    render(<DeltaChart {...aDeltaViewModelWith("step")} />);
    const areas = screen.getAllByTestId("area");
    expect(areas[0]).toHaveAttribute("data-type", "stepAfter");
  });

  it("renders the score area linearly for continuous deltas", () => {
    render(<DeltaChart {...aDeltaViewModelWith("linear")} />);
    const areas = screen.getAllByTestId("area");
    expect(areas[0]).toHaveAttribute("data-type", "linear");
  });

  it("renders both advantage overlays on the shared advantage axis when enabled", () => {
    const advantage = {
      points: [
        { timestampMs: 0, score: 0 },
        { timestampMs: 600000, score: 1 },
      ],
      minScore: -3,
      maxScore: 3,
    };
    render(
      <DeltaChart
        {...aDeltaViewModelWith("linear")}
        playerAdvantage={advantage}
        zoneAdvantage={advantage}
        advantageDomain={[-3, 3]}
      />,
    );

    const areaNames = screen.getAllByTestId("area").map((area) => area.getAttribute("data-name"));
    expect(areaNames).toContain("Player Advantage");
    expect(areaNames).toContain("Zone Advantage");
    const advantageAxes = screen
      .getAllByTestId("y-axis")
      .filter((axis) => axis.getAttribute("data-axis") === "advantage");
    expect(advantageAxes).toHaveLength(1);
  });

  it("renders a dashed reference line at each round boundary", () => {
    render(<DeltaChart {...aDeltaViewModelWith("linear")} roundBoundaries={[150000]} />);
    const boundaryLines = screen.getAllByTestId("reference-line").filter((line) => line.getAttribute("data-x") != null);
    expect(boundaryLines.map((line) => line.getAttribute("data-x"))).toEqual(["150000"]);
  });

  it("renders no advantage axis or overlay areas when overlays are hidden", () => {
    render(<DeltaChart {...aDeltaViewModelWith("linear")} />);
    const areaNames = screen.getAllByTestId("area").map((area) => area.getAttribute("data-name"));
    expect(areaNames).toEqual(["score"]);
    const advantageAxes = screen
      .getAllByTestId("y-axis")
      .filter((axis) => axis.getAttribute("data-axis") === "advantage");
    expect(advantageAxes).toHaveLength(0);
  });
});
