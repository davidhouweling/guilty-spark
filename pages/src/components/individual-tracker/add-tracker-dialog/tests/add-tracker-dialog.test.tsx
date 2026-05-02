import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  TrackerMatchHistoryEntry,
  TrackerMatchHistoryResponse,
  TrackerSearchResult,
} from "../../../../services/individual-tracker/types";
import { AddTrackerDialog } from "../add-tracker-dialog";

afterEach(() => {
  cleanup();
});

describe("AddTrackerDialog", () => {
  it("returns null when closed", () => {
    const { container } = render(
      <AddTrackerDialog
        isOpen={false}
        busy={false}
        onClose={vi.fn<() => void>()}
        onSearchGamertag={vi.fn<(query: string) => Promise<TrackerSearchResult | null>>()}
        onLoadMatches={vi.fn<(xuid: string, start: number, count: number) => Promise<TrackerMatchHistoryResponse>>()}
        onStartTracker={vi.fn<
          (payload: {
            gamertag: string;
            selectedMatchIds: readonly string[];
            matchGroupings: readonly (readonly string[])[];
            matches: readonly TrackerMatchHistoryEntry[];
          }) => Promise<void>
        >()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("searches and loads initial matches", async () => {
    const searchResult: TrackerSearchResult = {
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
    };

    const onSearchGamertag = vi.fn<(query: string) => Promise<TrackerSearchResult | null>>(async () =>
      Promise.resolve(searchResult),
    );
    const onLoadMatches = vi.fn<(xuid: string, start: number, count: number) => Promise<TrackerMatchHistoryResponse>>(
      async () =>
        Promise.resolve({
          matches: [],
          suggestedGroupings: [],
        }),
    );

    render(
      <AddTrackerDialog
        isOpen={true}
        busy={false}
        onClose={vi.fn<() => void>()}
        onSearchGamertag={onSearchGamertag}
        onLoadMatches={onLoadMatches}
        onStartTracker={vi.fn<
          (payload: {
            gamertag: string;
            selectedMatchIds: readonly string[];
            matchGroupings: readonly (readonly string[])[];
            matches: readonly TrackerMatchHistoryEntry[];
          }) => Promise<void>
        >()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Gamertag"), { target: { value: "Chief" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(onSearchGamertag).toHaveBeenCalledWith("Chief");
    });

    await waitFor(() => {
      expect(onLoadMatches).toHaveBeenCalledWith("xuid-1", 0, 25);
    });
  });

  it("starts tracker with selected matches and current groupings", async () => {
    const searchResult: TrackerSearchResult = {
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
    };

    const matches: TrackerMatchHistoryResponse = {
      matches: [
        {
          matchId: "match-1",
          startTime: "Jan 1, 2026, 12:00:00 AM",
          endTime: "Jan 1, 2026, 12:10:00 AM",
          mapAssetId: "map-1",
          modeAssetId: "mode-1",
          duration: "10m 0s",
          mapName: "Aquarius",
          modeName: "Slayer",
          outcome: "Win",
          resultString: "Win - 50:40",
          isMatchmaking: false,
          category: "custom",
          teams: [],
          mapThumbnailUrl: "data:,",
        },
        {
          matchId: "match-2",
          startTime: "Jan 1, 2026, 12:15:00 AM",
          endTime: "Jan 1, 2026, 12:25:00 AM",
          mapAssetId: "map-2",
          modeAssetId: "mode-2",
          duration: "10m 0s",
          mapName: "Bazaar",
          modeName: "Slayer",
          outcome: "Win",
          resultString: "Win - 50:40",
          isMatchmaking: false,
          category: "custom",
          teams: [],
          mapThumbnailUrl: "data:,",
        },
      ],
      suggestedGroupings: [["match-1", "match-2"]],
    };

    const onSearchGamertag = vi.fn<(query: string) => Promise<TrackerSearchResult | null>>(async () =>
      Promise.resolve(searchResult),
    );
    const onLoadMatches = vi.fn<(xuid: string, start: number, count: number) => Promise<TrackerMatchHistoryResponse>>(
      async () => Promise.resolve(matches),
    );
    const onStartTracker = vi.fn<
      (payload: {
        gamertag: string;
        selectedMatchIds: readonly string[];
        matchGroupings: readonly (readonly string[])[];
        matches: readonly TrackerMatchHistoryEntry[];
      }) => Promise<void>
    >(async () => Promise.resolve());

    render(
      <AddTrackerDialog
        isOpen={true}
        busy={false}
        onClose={vi.fn<() => void>()}
        onSearchGamertag={onSearchGamertag}
        onLoadMatches={onLoadMatches}
        onStartTracker={onStartTracker}
      />,
    );

    fireEvent.change(screen.getByLabelText("Gamertag"), { target: { value: "Chief" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(onLoadMatches).toHaveBeenCalledWith("xuid-1", 0, 25);
    });

    const matchCheckboxes = screen.getAllByRole("checkbox").filter((element) => element.id.startsWith("match-"));
    const [match1Checkbox] = matchCheckboxes;
    fireEvent.click(match1Checkbox);
    fireEvent.click(screen.getByRole("button", { name: "Start tracker" }));

    await waitFor(() => {
      expect(onStartTracker).toHaveBeenCalledWith(
        expect.objectContaining({
          gamertag: "Chief",
          selectedMatchIds: expect.arrayContaining(["match-1"]),
          matchGroupings: [["match-1", "match-2"]],
          matches: matches.matches,
        }),
      );
    });
  });

  it("hides short matches by default and reveals them when the filter is disabled", async () => {
    const searchResult: TrackerSearchResult = {
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
    };

    const matches: TrackerMatchHistoryResponse = {
      matches: [
        {
          matchId: "match-short",
          startTime: "Jan 1, 2026, 12:00:00 AM",
          endTime: "Jan 1, 2026, 12:01:30 AM",
          mapAssetId: "map-short",
          modeAssetId: "mode-short",
          duration: "1m 30s",
          mapName: "Aquarius",
          modeName: "Slayer",
          outcome: "Win",
          resultString: "Win - 50:40",
          isMatchmaking: false,
          category: "custom",
          teams: [],
          mapThumbnailUrl: "data:,",
        },
        {
          matchId: "match-long",
          startTime: "Jan 1, 2026, 12:15:00 AM",
          endTime: "Jan 1, 2026, 12:25:00 AM",
          mapAssetId: "map-long",
          modeAssetId: "mode-long",
          duration: "10m 0s",
          mapName: "Bazaar",
          modeName: "Slayer",
          outcome: "Win",
          resultString: "Win - 50:40",
          isMatchmaking: false,
          category: "custom",
          teams: [],
          mapThumbnailUrl: "data:,",
        },
      ],
      suggestedGroupings: [],
    };

    render(
      <AddTrackerDialog
        isOpen={true}
        busy={false}
        onClose={vi.fn<() => void>()}
        onSearchGamertag={vi.fn<(query: string) => Promise<TrackerSearchResult | null>>(async () =>
          Promise.resolve(searchResult),
        )}
        onLoadMatches={vi.fn<(xuid: string, start: number, count: number) => Promise<TrackerMatchHistoryResponse>>(
          async () => Promise.resolve(matches),
        )}
        onStartTracker={vi.fn<
          (payload: {
            gamertag: string;
            selectedMatchIds: readonly string[];
            matchGroupings: readonly (readonly string[])[];
            matches: readonly TrackerMatchHistoryEntry[];
          }) => Promise<void>
        >()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Gamertag"), { target: { value: "Chief" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(screen.queryByText("Slayer: Aquarius")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Slayer: Bazaar")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Hide games < 2m duration"));

    expect(screen.getByText("Slayer: Aquarius")).toBeInTheDocument();
  });
});
