import "@testing-library/jest-dom/vitest";

import React, { cloneElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TimelineGanttChart } from "../timeline-gantt-chart";
import { aFakeTimelineGanttRowWith } from "../../fakes/timeline-gantt-row.fake";
import type { TimelineGanttRowViewModel } from "../../types";

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
      rows?: readonly TimelineGanttRowViewModel[];
    }>;
  }): React.ReactElement => <div data-testid="y-axis">{cloneElement(tick, { x: 0, y: 0, payload: { value: 1 } })}</div>,
  Tooltip: (): null => null,
}));

describe("TimelineGanttChart", () => {
  it("renders a Bar element", () => {
    render(<TimelineGanttChart durationMs={30000} rows={[aFakeTimelineGanttRowWith()]} />);
    expect(screen.getByTestId("bar")).toBeTruthy();
  });

  it("renders a Y-axis tick with the display-ready sub-label", () => {
    render(
      <TimelineGanttChart durationMs={30000} rows={[aFakeTimelineGanttRowWith({ subLabel: "Eagle 64 · Cobra 28" })]} />,
    );
    const yAxis = screen.getByTestId("y-axis");
    expect(yAxis.textContent).toContain("Eagle 64 · Cobra 28");
  });

  it("renders no sub-label text when the sub-label is empty", () => {
    render(<TimelineGanttChart durationMs={30000} rows={[aFakeTimelineGanttRowWith({ subLabel: "" })]} />);
    const yAxis = screen.getByTestId("y-axis");
    expect(yAxis.textContent).toBe("Hill 1");
  });
});
