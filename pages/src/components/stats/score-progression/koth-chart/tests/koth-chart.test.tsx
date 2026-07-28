import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

afterEach(cleanup);
import { KothChart } from "../koth-chart";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }): React.ReactElement => <div>{children}</div>,
  ComposedChart: ({ children }: { children: React.ReactNode }): React.ReactElement => <div>{children}</div>,
  XAxis: (): null => null,
  ReferenceArea: ({ x1, x2 }: { x1: number; x2: number }): React.ReactElement => (
    <div data-testid="reference-area" data-x1={x1} data-x2={x2} />
  ),
  ReferenceLine: ({ x }: { x: number }): React.ReactElement => (
    <div data-testid="reference-line" data-x={x} />
  ),
}));

const BASE_DATA = {
  durationMs: 600000,
  segments: [
    { startMs: 0, endMs: 200000, color: "#ff0000" },
    { startMs: 200000, endMs: 400000, color: "#0000ff" },
  ],
  captureMarkers: [{ timestampMs: 200000 }],
};

describe("KothChart", () => {
  it("renders with accessible role and label", () => {
    render(<KothChart {...BASE_DATA} />);
    expect(screen.getByRole("img", { name: "Hill control timeline" })).toBeInTheDocument();
  });

  it("renders one ReferenceArea per segment", () => {
    render(<KothChart {...BASE_DATA} />);
    expect(screen.getAllByTestId("reference-area")).toHaveLength(2);
  });

  it("renders one ReferenceLine per capture marker", () => {
    render(<KothChart {...BASE_DATA} />);
    expect(screen.getAllByTestId("reference-line")).toHaveLength(1);
  });

  it("renders without error when segments and captureMarkers are empty", () => {
    render(<KothChart durationMs={600000} segments={[]} captureMarkers={[]} />);
    expect(screen.getByRole("img", { name: "Hill control timeline" })).toBeInTheDocument();
    expect(screen.queryAllByTestId("reference-area")).toHaveLength(0);
    expect(screen.queryAllByTestId("reference-line")).toHaveLength(0);
  });
});
