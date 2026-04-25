import "@testing-library/jest-dom/vitest";

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TrackerMatchHistoryResponse, TrackerSearchResult } from "../../../../services/individual-tracker/types";
import { AddTrackerDialog } from "../add-tracker-dialog";

describe("AddTrackerDialog", () => {
  it("returns null when closed", () => {
    const { container } = render(
      <AddTrackerDialog
        isOpen={false}
        busy={false}
        onClose={vi.fn<() => void>()}
        onSearchGamertag={vi.fn<(query: string) => Promise<TrackerSearchResult | null>>()}
        onLoadMatches={vi.fn<(xuid: string, start: number, count: number) => Promise<TrackerMatchHistoryResponse>>()}
        onStartTracker={vi.fn<(payload: { gamertag: string; selectedMatchIds: readonly string[] }) => Promise<void>>()}
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
        onStartTracker={vi.fn<(payload: { gamertag: string; selectedMatchIds: readonly string[] }) => Promise<void>>()}
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
});
