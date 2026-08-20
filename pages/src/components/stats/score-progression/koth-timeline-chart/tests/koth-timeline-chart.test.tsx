import "@testing-library/jest-dom/vitest";

import React, { cloneElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { KothTimelineChart } from "../koth-timeline-chart";
import { aFakeKothHillDataWith } from "../../fakes/koth-hill-data.fake";
import type { KothHillData, KothTimelineHillViewModel } from "../../types";

afterEach(() => {
  cleanup();
});

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }): React.ReactElement => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }): React.ReactElement => <div>{children}</div>,
  Bar: ({ shape }: { shape: React.ReactElement }): React.ReactElement => <div data-testid="bar">{shape}</div>,
  XAxis: (): null => null,
  YAxis: ({
    tick,
  }: {
    tick: React.ReactElement<{
      x?: number;
      y?: number;
      payload?: { value: number };
      hills?: readonly KothTimelineHillViewModel[];
    }>;
  }): React.ReactElement => <div data-testid="y-axis">{cloneElement(tick, { x: 0, y: 0, payload: { value: 1 } })}</div>,
  Tooltip: (): null => null,
}));

function aFakeTimelineHill(
  overrides: Partial<KothHillData> = {},
  captureProgressLabel = "",
): KothTimelineHillViewModel {
  return { ...aFakeKothHillDataWith(overrides), captureProgressLabel };
}

describe("KothTimelineChart", () => {
  it("renders a Bar element", () => {
    render(<KothTimelineChart durationMs={30000} hills={[aFakeTimelineHill()]} />);
    expect(screen.getByTestId("bar")).toBeTruthy();
  });

  it("renders a Y-axis tick with the display-ready occupancy label", () => {
    render(<KothTimelineChart durationMs={30000} hills={[aFakeTimelineHill({}, "Eagle 50% · Cobra 33%")]} />);
    const yAxis = screen.getByTestId("y-axis");
    expect(yAxis.textContent).toContain("Eagle 50% · Cobra 33%");
  });

  it("renders no occupancy text when the occupancy label is empty", () => {
    render(<KothTimelineChart durationMs={30000} hills={[aFakeTimelineHill()]} />);
    const yAxis = screen.getByTestId("y-axis");
    expect(yAxis.textContent).toBe("Hill 1");
  });
});
