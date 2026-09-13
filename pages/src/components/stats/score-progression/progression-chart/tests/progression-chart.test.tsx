import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProgressionChart } from "../progression-chart";
import type { ScoreProgressionProgressionViewModel } from "../../types";

afterEach(() => {
  cleanup();
});

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }): React.ReactElement => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }): React.ReactElement => <div>{children}</div>,
  CartesianGrid: (): null => null,
  ReferenceLine: ({ x }: { x?: number }): React.ReactElement => <div data-testid="reference-line" data-x={x} />,
  ReferenceDot: ({
    x,
    y,
    fill,
    stroke,
  }: {
    x: number;
    y: number;
    fill: string;
    stroke: string;
  }): React.ReactElement => (
    <div data-testid="reference-dot" data-x={x} data-y={y} data-fill={fill} data-stroke={stroke} />
  ),
  XAxis: (): null => null,
  YAxis: ({ yAxisId, domain }: { yAxisId?: string; domain?: readonly [number, number] }): React.ReactElement => (
    <div data-testid="y-axis" data-axis={yAxisId} data-domain={domain?.join(",")} />
  ),
  Tooltip: (): null => null,
  Area: ({ name }: { name: string }): React.ReactElement => <div data-testid="area">{name}</div>,
}));

const teamLines = [
  { teamId: 0, name: "Eagle", color: "#0000ff", points: [] },
  { teamId: 1, name: "Cobra", color: "#ff0000", points: [] },
] as const;

function aProgressionViewModelWith(
  overrides: Partial<ScoreProgressionProgressionViewModel> = {},
): ScoreProgressionProgressionViewModel {
  return {
    durationMs: 600000,
    teamLines,
    playerAdvantage: null,
    zoneAdvantage: null,
    advantageDomain: null,
    markers: null,
    tooltipFormatter: (value: unknown): [string, string] => [String(value), ""],
    ...overrides,
  };
}

describe("ProgressionChart", () => {
  it("renders an Area for each team line", () => {
    render(<ProgressionChart {...aProgressionViewModelWith()} />);

    const areas = screen.getAllByTestId("area");
    expect(areas).toHaveLength(2);
    expect(areas[0]).toHaveTextContent("Eagle");
    expect(areas[1]).toHaveTextContent("Cobra");
  });

  it("renders a filled dot for a capture and a hollow dot for a secure", () => {
    render(
      <ProgressionChart
        {...aProgressionViewModelWith({
          markers: [
            { timestampMs: 30000, score: 12, teamId: 0, teamName: "Eagle", color: "#0000ff", kind: "capture" },
            { timestampMs: 60000, score: 40, teamId: 1, teamName: "Cobra", color: "#ff0000", kind: "secure" },
          ],
        })}
      />,
    );

    const dots = screen.getAllByTestId("reference-dot");
    expect(dots).toHaveLength(2);
    expect(dots[0]).toHaveAttribute("data-fill", "#0000ff");
    expect(dots[0]).toHaveAttribute("data-x", "30000");
    expect(dots[1]).toHaveAttribute("data-fill", "transparent");
    expect(dots[1]).toHaveAttribute("data-stroke", "#ff0000");
  });

  it("renders zone and player advantage overlays as named areas", () => {
    const advantage = {
      points: [
        { timestampMs: 0, score: 0 },
        { timestampMs: 600000, score: 1 },
      ],
      minScore: -3,
      maxScore: 3,
    };
    render(
      <ProgressionChart
        {...aProgressionViewModelWith({
          playerAdvantage: advantage,
          zoneAdvantage: advantage,
          advantageDomain: [-3, 3],
        })}
      />,
    );

    const areaNames = screen.getAllByTestId("area").map((area) => area.textContent);
    expect(areaNames).toContain("Player Advantage");
    expect(areaNames).toContain("Zone Advantage");
    const advantageAxes = screen
      .getAllByTestId("y-axis")
      .filter((axis) => axis.getAttribute("data-axis") === "advantage");
    expect(advantageAxes).toHaveLength(1);
    expect(advantageAxes[0]).toHaveAttribute("data-domain", "-3,3");
  });

  it("renders a dashed reference line at each round boundary", () => {
    render(<ProgressionChart {...aProgressionViewModelWith({ roundBoundaries: [200000, 400000] })} />);
    const boundaryLines = screen.getAllByTestId("reference-line").filter((line) => line.getAttribute("data-x") != null);
    expect(boundaryLines.map((line) => line.getAttribute("data-x"))).toEqual(["200000", "400000"]);
  });

  it("renders no advantage axis when no overlay is enabled", () => {
    render(<ProgressionChart {...aProgressionViewModelWith()} />);
    const advantageAxes = screen
      .getAllByTestId("y-axis")
      .filter((axis) => axis.getAttribute("data-axis") === "advantage");
    expect(advantageAxes).toHaveLength(0);
  });
});
