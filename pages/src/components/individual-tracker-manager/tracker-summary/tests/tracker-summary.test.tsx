import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { TrackerSearchResult } from "../tracker-summary";
import { TrackerSummary } from "../tracker-summary";

vi.mock("../../../icons/rank-icon", () => ({
  RankIcon: (): React.ReactNode => <span data-testid="rank-icon" />,
}));

afterEach(() => {
  cleanup();
});

function aFakeTrackerSearchResult(overrides?: Partial<TrackerSearchResult>): TrackerSearchResult {
  return {
    gamertag: "Chief",
    xuid: "xuid-001",
    csrLabel: "1500",
    currentRankTier: "Diamond",
    currentRankSubTier: 3,
    currentRankMeasurementMatchesRemaining: null,
    currentRankInitialMeasurementMatches: null,
    allTimePeakCsrLabel: "1800",
    allTimePeakRankTier: "Onyx",
    allTimePeakRankSubTier: null,
    seasonPeakCsrLabel: "1600",
    seasonPeakRankTier: "Diamond",
    seasonPeakRankSubTier: 4,
    matchmadeMatchCount: 200,
    customMatchCount: 50,
    ...overrides,
  };
}

describe("TrackerSummary", () => {
  it("renders rank stat labels", () => {
    render(<TrackerSummary tracker={aFakeTrackerSearchResult()} />);

    expect(screen.getByText("Current rank:")).toBeInTheDocument();
    expect(screen.getByText("Season peak:")).toBeInTheDocument();
    expect(screen.getByText("All time peak:")).toBeInTheDocument();
  });

  it("renders formatted CSR values", () => {
    render(<TrackerSummary tracker={aFakeTrackerSearchResult({ csrLabel: "1500" })} />);

    expect(screen.getByText("1,500")).toBeInTheDocument();
  });

  it("renders a dash when CSR value is null", () => {
    render(
      <TrackerSummary
        tracker={aFakeTrackerSearchResult({ csrLabel: null, seasonPeakCsrLabel: null, allTimePeakCsrLabel: null })}
      />,
    );

    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it("renders match count labels and values", () => {
    render(<TrackerSummary tracker={aFakeTrackerSearchResult({ matchmadeMatchCount: 200, customMatchCount: 50 })} />);

    expect(screen.getByText("Matchmaking games:")).toBeInTheDocument();
    expect(screen.getByText("Custom games:")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("renders dashes for null match counts", () => {
    render(
      <TrackerSummary tracker={aFakeTrackerSearchResult({ matchmadeMatchCount: null, customMatchCount: null })} />,
    );

    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("renders rank icons for current rank, season peak, and all-time peak", () => {
    render(<TrackerSummary tracker={aFakeTrackerSearchResult()} />);

    const rankIcons = screen.getAllByTestId("rank-icon");
    expect(rankIcons).toHaveLength(3);
  });

  it("applies the optional className to the card element", () => {
    const { container } = render(<TrackerSummary tracker={aFakeTrackerSearchResult()} className="custom-class" />);

    expect(container.firstChild).toHaveClass("custom-class");
  });
});
