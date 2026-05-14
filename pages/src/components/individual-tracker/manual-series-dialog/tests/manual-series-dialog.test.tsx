import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TrackerMatchHistoryEntry, TrackerSearchResult } from "../../../../services/individual-tracker/types";
import { ManualSeriesDialog } from "../manual-series-dialog";

afterEach(() => {
  cleanup();
});

function aMatchEntryWith(overrides: Partial<TrackerMatchHistoryEntry>): TrackerMatchHistoryEntry {
  return {
    matchId: "match-default",
    startTime: "Jan 1, 2026, 12:00:00 AM",
    endTime: "Jan 1, 2026, 12:10:00 AM",
    mapAssetId: "map-1",
    mapVersionId: "map-version-1",
    modeAssetId: "mode-1",
    modeVersionId: "mode-version-1",
    gameVariantCategory: 6,
    startTimeIso: "2026-01-01T00:00:00.000Z",
    endTimeIso: "2026-01-01T00:10:00.000Z",
    duration: "10m 0s",
    mapName: "Aquarius",
    modeName: "Slayer",
    outcome: "Win",
    resultString: "Win - 50:40",
    isMatchmaking: false,
    category: "custom",
    teams: [],
    mapThumbnailUrl: "data:,",
    ...overrides,
  };
}

function aSearchResultWith(gamertag: string, xuid: string): TrackerSearchResult {
  return {
    gamertag,
    xuid,
    rankLabel: null,
    csrLabel: null,
    currentRankTier: null,
    currentRankSubTier: null,
    currentRankMeasurementMatchesRemaining: null,
    currentRankInitialMeasurementMatches: null,
    allTimePeakRankLabel: null,
    allTimePeakCsrLabel: null,
    allTimePeakRankTier: null,
    allTimePeakRankSubTier: null,
    seasonPeakCsrLabel: null,
    seasonPeakRankTier: null,
    seasonPeakRankSubTier: null,
    matchmadeMatchCount: null,
    customMatchCount: null,
  };
}

describe("ManualSeriesDialog", () => {
  it("discovers shared custom matches by player intersection and submits selected backfill matches", async () => {
    const onSearchGamertag = vi.fn(async (query: string) => {
      if (query === "Alpha") {
        return await Promise.resolve(aSearchResultWith("Alpha", "xuid-alpha"));
      }

      if (query === "Bravo") {
        return await Promise.resolve(aSearchResultWith("Bravo", "xuid-bravo"));
      }

      return await Promise.resolve(null);
    });

    const alphaMatches = [
      aMatchEntryWith({ matchId: "m-shared", modeName: "Slayer", mapName: "Aquarius" }),
      aMatchEntryWith({ matchId: "m-alpha-only", modeName: "Oddball", mapName: "Streets" }),
      aMatchEntryWith({ matchId: "m-matchmaking", category: "matchmaking", isMatchmaking: true }),
    ];

    const bravoMatches = [
      aMatchEntryWith({ matchId: "m-shared", modeName: "Slayer", mapName: "Aquarius" }),
      aMatchEntryWith({ matchId: "m-bravo-only", modeName: "CTF", mapName: "Bazaar" }),
    ];

    const onLoadMatches = vi.fn(async (xuid: string) => {
      if (xuid === "xuid-alpha") {
        return await Promise.resolve({ matches: alphaMatches });
      }

      if (xuid === "xuid-bravo") {
        return await Promise.resolve({ matches: bravoMatches });
      }

      return await Promise.resolve({ matches: [] });
    });

    const onStartSeries = vi.fn(async () => Promise.resolve());

    render(
      <ManualSeriesDialog
        isOpen={true}
        busy={false}
        trackerLabel="Owner Tracker"
        onClose={vi.fn()}
        onSearchGamertag={onSearchGamertag}
        onLoadMatches={onLoadMatches}
        onStartSeries={onStartSeries}
      />,
    );

    const playerInputs = screen.getAllByPlaceholderText("Gamertag");
    fireEvent.change(playerInputs[0], { target: { value: "Alpha" } });
    fireEvent.change(playerInputs[4], { target: { value: "Bravo" } });

    fireEvent.click(screen.getByRole("button", { name: "Add existing custom games" }));

    await waitFor(() => {
      expect(onSearchGamertag).toHaveBeenCalledWith("Alpha");
      expect(onSearchGamertag).toHaveBeenCalledWith("Bravo");
    });

    await waitFor(() => {
      expect(onLoadMatches).toHaveBeenCalledWith("xuid-alpha", 0, 25);
      expect(onLoadMatches).toHaveBeenCalledWith("xuid-bravo", 0, 25);
    });

    expect(screen.getByText("Slayer: Aquarius")).toBeInTheDocument();
    expect(screen.queryByText("Oddball: Streets")).not.toBeInTheDocument();
    expect(screen.queryByText("CTF: Bazaar")).not.toBeInTheDocument();

    const sharedMatchCheckbox = document.getElementById("match-m-shared");
    expect(sharedMatchCheckbox).toBeInstanceOf(HTMLInputElement);

    if (!(sharedMatchCheckbox instanceof HTMLInputElement)) {
      throw new Error("Expected shared match checkbox to exist");
    }

    expect(sharedMatchCheckbox).not.toBeChecked();
    expect(screen.queryByTitle("Add to group above")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Add to group below")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Break from group")).not.toBeInTheDocument();

    fireEvent.click(sharedMatchCheckbox);

    fireEvent.click(screen.getByRole("button", { name: "Start series" }));

    await waitFor(() => {
      expect(onStartSeries).toHaveBeenCalledWith(
        expect.objectContaining({
          backfillSelectedMatchIds: ["m-shared"],
        }),
      );
    });
  });
});
