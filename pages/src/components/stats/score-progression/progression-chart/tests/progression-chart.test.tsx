import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProgressionChart } from "../progression-chart";

afterEach(() => {
  cleanup();
});

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }): React.ReactElement => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }): React.ReactElement => <div>{children}</div>,
  CartesianGrid: (): null => null,
  XAxis: (): null => null,
  YAxis: (): null => null,
  Tooltip: (): null => null,
  ReferenceLine: (): null => null,
  ReferenceArea: ({ fill }: { fill: string }): React.ReactElement => (
    <div data-testid="reference-area" data-fill={fill} />
  ),
  Area: ({ name }: { name: string }): React.ReactElement => <div data-testid="area">{name}</div>,
}));

const TOOLTIP_FORMATTER = (value: unknown): [string, string] => [String(value), ""];

const TEAM_LINES = [
  { teamId: 0, name: "Eagle", color: "#0000ff", points: [] },
  { teamId: 1, name: "Cobra", color: "#ff0000", points: [] },
] as const;

describe("ProgressionChart", () => {
  it("renders an Area for each team line", () => {
    render(
      <ProgressionChart
        durationMs={600000}
        teamLines={TEAM_LINES}
        playerAdvantage={null}
        controlPeriods={[]}
        tooltipFormatter={TOOLTIP_FORMATTER}
      />,
    );

    const areas = screen.getAllByTestId("area");
    expect(areas).toHaveLength(2);
    expect(areas[0]).toHaveTextContent("Eagle");
    expect(areas[1]).toHaveTextContent("Cobra");
  });

  it("renders a ReferenceArea for each control period with a non-null color", () => {
    const controlPeriods = [
      { startMs: 0, endMs: 5000, color: "#0000ff" },
      { startMs: 5000, endMs: 10000, color: "#ff0000" },
    ] as const;

    render(
      <ProgressionChart
        durationMs={600000}
        teamLines={TEAM_LINES}
        playerAdvantage={null}
        controlPeriods={controlPeriods}
        tooltipFormatter={TOOLTIP_FORMATTER}
      />,
    );

    const referenceAreas = screen.getAllByTestId("reference-area");
    expect(referenceAreas).toHaveLength(2);
    expect(referenceAreas[0]).toHaveAttribute("data-fill", "#0000ff");
    expect(referenceAreas[1]).toHaveAttribute("data-fill", "#ff0000");
  });

  it("does not render a ReferenceArea for contested periods with null color", () => {
    const controlPeriods = [
      { startMs: 0, endMs: 5000, color: null },
      { startMs: 5000, endMs: 10000, color: "#ff0000" },
    ] as const;

    render(
      <ProgressionChart
        durationMs={600000}
        teamLines={TEAM_LINES}
        playerAdvantage={null}
        controlPeriods={controlPeriods}
        tooltipFormatter={TOOLTIP_FORMATTER}
      />,
    );

    const referenceAreas = screen.getAllByTestId("reference-area");
    expect(referenceAreas).toHaveLength(1);
    expect(referenceAreas[0]).toHaveAttribute("data-fill", "#ff0000");
  });

  it("renders no ReferenceArea elements when controlPeriods is empty", () => {
    render(
      <ProgressionChart
        durationMs={600000}
        teamLines={TEAM_LINES}
        playerAdvantage={null}
        controlPeriods={[]}
        tooltipFormatter={TOOLTIP_FORMATTER}
      />,
    );

    expect(screen.queryAllByTestId("reference-area")).toHaveLength(0);
  });
});
