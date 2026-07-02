import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import type React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { OverlayStatsHighlights } from "../overlay-stats-highlights";

vi.mock("../../../icons/rank-icon", () => ({
  RankIcon: (): React.ReactElement => <img alt="rank-icon" />,
}));

afterEach(() => {
  cleanup();
});

describe("OverlayStatsHighlights", () => {
  it("renders nothing when items array is empty", () => {
    const { container } = render(<OverlayStatsHighlights items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders all provided stat items", () => {
    render(
      <OverlayStatsHighlights
        items={[
          { label: "Won:Loss", value: "5:3" },
          { label: "KDA", value: "3.2" },
        ]}
      />,
    );

    expect(screen.getByText("Won:Loss")).toBeInTheDocument();
    expect(screen.getByText("5:3")).toBeInTheDocument();
    expect(screen.getByText("KDA")).toBeInTheDocument();
    expect(screen.getByText("3.2")).toBeInTheDocument();
  });

  it("renders N/A value for a slot with no data", () => {
    render(<OverlayStatsHighlights items={[{ label: "Kills", value: "N/A" }]} />);

    expect(screen.getByText("Kills")).toBeInTheDocument();
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("renders rank icon when slot has rank metadata", () => {
    render(
      <OverlayStatsHighlights
        items={[
          {
            label: "Current Rank",
            value: "1,500",
            rankIcon: {
              rankTier: "Onyx",
              subTier: 0,
              measurementMatchesRemaining: 0,
              initialMeasurementMatches: 10,
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("Current Rank")).toBeInTheDocument();
    expect(screen.getByText("1,500")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "rank-icon" })).toBeInTheDocument();
  });
});
