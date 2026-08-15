import "@testing-library/jest-dom/vitest";

import React, { cloneElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { KothTimelineChart } from "../koth-timeline-chart";
import type { KothHillData } from "../../types";

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
    tick: React.ReactElement<{ x?: number; y?: number; payload?: { value: number }; hills?: readonly KothHillData[] }>;
  }): React.ReactElement => <div data-testid="y-axis">{cloneElement(tick, { x: 0, y: 0, payload: { value: 1 } })}</div>,
  Tooltip: (): null => null,
}));

function aFakeHill(overrides: Partial<KothHillData> = {}): KothHillData {
  return {
    hillIndex: 1,
    startMs: 0,
    endMs: 30000,
    segments: [
      { startMs: 0, endMs: 15000, teamId: 0, color: "#0000ff" },
      { startMs: 15000, endMs: 25000, teamId: 1, color: "#ff0000" },
      { startMs: 25000, endMs: 30000, teamId: null, color: null },
    ],
    winnerTeamId: 1,
    winnerColor: "#ff0000",
    winnerName: "Cobra",
    teamOccupancies: [
      { teamId: 0, name: "Eagle", color: "#0000ff", percentage: 50 },
      { teamId: 1, name: "Cobra", color: "#ff0000", percentage: 33 },
    ],
    ...overrides,
  };
}

describe("KothTimelineChart", () => {
  it("renders a Bar element", () => {
    render(<KothTimelineChart durationMs={30000} hills={[aFakeHill()]} />);
    expect(screen.getByTestId("bar")).toBeTruthy();
  });

  it("renders a Y-axis tick with hill occupancy text", () => {
    render(<KothTimelineChart durationMs={30000} hills={[aFakeHill()]} />);
    const yAxis = screen.getByTestId("y-axis");
    expect(yAxis.textContent).toContain("Eagle 50%");
    expect(yAxis.textContent).toContain("Cobra 33%");
  });
});
