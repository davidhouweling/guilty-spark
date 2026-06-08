import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TrackerMatchHistoryEntry, TrackerSearchResult } from "../../../../services/individual-tracker/types";
import { AddTrackerDialog } from "../add-tracker-dialog";

vi.mock("../../../icons/rank-icon", () => ({
  RankIcon: (): React.ReactNode => <span data-testid="rank-icon" />,
}));

vi.mock("../../../icons/team-icon", () => ({
  TeamIcon: (): React.ReactNode => <span data-testid="team-icon" />,
}));

afterEach(() => {
  cleanup();
});

function aFakeSearchResult(overrides?: Partial<TrackerSearchResult>): TrackerSearchResult {
  return {
    gamertag: "Chief",
    xuid: "xuid-1",
    rankLabel: "Gold 5",
    csrLabel: "1200",
    currentRankTier: "Gold",
    currentRankSubTier: 5,
    currentRankMeasurementMatchesRemaining: null,
    currentRankInitialMeasurementMatches: null,
    allTimePeakRankLabel: "Platinum 1",
    allTimePeakCsrLabel: "1300",
    allTimePeakRankTier: "Platinum",
    allTimePeakRankSubTier: 1,
    seasonPeakCsrLabel: "1250",
    seasonPeakRankTier: "Gold",
    seasonPeakRankSubTier: 6,
    matchmadeMatchCount: 20,
    customMatchCount: 8,
    ...overrides,
  };
}

function aFakeMatch(matchId: string): TrackerMatchHistoryEntry {
  return {
    matchId,
    startTime: "Jan 1, 2026, 12:00:00 AM",
    endTime: "Jan 1, 2026, 12:10:00 AM",
    mapAssetId: "map-1",
    mapVersionId: "map-v-1",
    modeAssetId: "mode-1",
    modeVersionId: "mode-v-1",
    gameVariantCategory: 6,
    duration: "10m 0s",
    mapName: "Aquarius",
    modeName: "Slayer",
    outcome: "Win",
    resultString: "Win - 50:40",
    isMatchmaking: false,
    category: "custom",
    teams: [],
    mapThumbnailUrl: "data:,",
  };
}

const defaultProps = {
  open: true,
  busy: false,
  query: "",
  searching: false,
  searchError: null,
  result: null,
  visibleMatches: null,
  activeGroupings: [] as readonly (readonly string[])[],
  loadingMatches: false,
  hasMore: false,
  selectedMatchIds: new Set<string>(),
  seriesGroups: [] as const,
  hideShortGames: true,
  canStart: false,
  onClose: vi.fn<() => void>(),
  onQueryChange: vi.fn<(v: string) => void>(),
  onSearch: vi.fn<() => void>(),
  onMatchToggle: vi.fn<(id: string) => void>(),
  onLoadMore: vi.fn<() => Promise<void>>(async () => Promise.resolve()),
  onAddToAboveGroup: vi.fn<(id: string) => void>(),
  onAddToBelowGroup: vi.fn<(id: string) => void>(),
  onBreakFromGroup: vi.fn<(id: string) => void>(),
  onHideShortGamesChange: vi.fn<(v: boolean) => void>(),
  onSeriesGroupTitleChange: vi.fn<(i: number, v: string | null) => void>(),
  onSeriesGroupSubtitleChange: vi.fn<(i: number, v: string | null) => void>(),
  onStartTracker: vi.fn<() => void>(),
};

describe("AddTrackerDialog", () => {
  it("renders null when closed", () => {
    const { container } = render(<AddTrackerDialog {...defaultProps} open={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the dialog title when open", () => {
    render(<AddTrackerDialog {...defaultProps} />);

    expect(screen.getByText("Add Tracker")).toBeInTheDocument();
  });

  it("calls onQueryChange when the gamertag input changes", () => {
    const onQueryChange = vi.fn<(v: string) => void>();
    render(<AddTrackerDialog {...defaultProps} onQueryChange={onQueryChange} />);

    fireEvent.change(screen.getByLabelText("Gamertag"), { target: { value: "Chief" } });

    expect(onQueryChange).toHaveBeenCalledWith("Chief");
  });

  it("calls onSearch when Search is clicked", () => {
    const onSearch = vi.fn<() => void>();
    render(<AddTrackerDialog {...defaultProps} query="Chief" onSearch={onSearch} />);

    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(onSearch).toHaveBeenCalledOnce();
  });

  it("disables Search button when query is empty", () => {
    render(<AddTrackerDialog {...defaultProps} query="" />);

    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
  });

  it("shows the search error alert when searchError is set", () => {
    render(<AddTrackerDialog {...defaultProps} searchError="No matching gamertag found." />);

    expect(screen.getByText("No matching gamertag found.")).toBeInTheDocument();
  });

  it("shows the tracker summary when result is set", () => {
    render(<AddTrackerDialog {...defaultProps} result={aFakeSearchResult()} />);

    expect(screen.getByText("Current rank:")).toBeInTheDocument();
  });

  it("shows muted prompt when result is null", () => {
    render(<AddTrackerDialog {...defaultProps} result={null} />);

    expect(screen.getByText("Search for a gamertag first to load recent matches.")).toBeInTheDocument();
  });

  it("renders match cards when visibleMatches is set", () => {
    render(
      <AddTrackerDialog
        {...defaultProps}
        result={aFakeSearchResult()}
        visibleMatches={[aFakeMatch("m1")]}
        activeGroupings={[]}
        loadingMatches={false}
      />,
    );

    expect(screen.getByText("Slayer: Aquarius")).toBeInTheDocument();
  });

  it("calls onStartTracker when Start tracker is clicked", async () => {
    const onStartTracker = vi.fn<() => void>();
    render(<AddTrackerDialog {...defaultProps} canStart={true} onStartTracker={onStartTracker} />);

    fireEvent.click(screen.getByRole("button", { name: "Start tracker" }));

    await waitFor(() => {
      expect(onStartTracker).toHaveBeenCalledOnce();
    });
  });

  it("disables Start tracker when canStart is false", () => {
    render(<AddTrackerDialog {...defaultProps} canStart={false} />);

    expect(screen.getByRole("button", { name: "Start tracker" })).toBeDisabled();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn<() => void>();
    render(<AddTrackerDialog {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows busy label on Start tracker button when busy", () => {
    render(<AddTrackerDialog {...defaultProps} busy={true} canStart={true} />);

    expect(screen.getByRole("button", { name: "Starting..." })).toBeInTheDocument();
  });
});
