import "@testing-library/jest-dom/vitest";

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressionChart } from "../progression-chart";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }): React.ReactElement => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }): React.ReactElement => <div>{children}</div>,
  CartesianGrid: (): null => null,
  XAxis: (): null => null,
  YAxis: (): null => null,
  Tooltip: (): null => null,
  Area: ({ name }: { name: string }): React.ReactElement => <div data-testid="area">{name}</div>,
}));

describe("ProgressionChart", () => {
  it("renders an Area for each team line", () => {
    const teamLines = [
      { teamId: 0, name: "Eagle", color: "#0000ff", points: [] },
      { teamId: 1, name: "Cobra", color: "#ff0000", points: [] },
    ] as const;

    render(<ProgressionChart durationMs={600000} teamLines={teamLines} playerAdvantage={null} />);

    const areas = screen.getAllByTestId("area");
    expect(areas).toHaveLength(2);
    expect(areas[0]).toHaveTextContent("Eagle");
    expect(areas[1]).toHaveTextContent("Cobra");
  });
});
