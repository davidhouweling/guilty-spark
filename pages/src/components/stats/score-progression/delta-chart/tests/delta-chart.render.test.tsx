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
  ReferenceLine: (): null => null,
  Tooltip: (): null => null,
  XAxis: (): null => null,
  YAxis: (): null => null,
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
    tooltipFormatter: (value: unknown): [string, string] => [String(value), "Delta"],
    advantageTooltipFormatter: (value: unknown): [string, string] => [String(value), "Player Advantage"],
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
});
