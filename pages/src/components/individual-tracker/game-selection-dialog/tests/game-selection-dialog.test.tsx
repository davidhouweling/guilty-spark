import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TrackerMatchHistoryResponse } from "../../../../services/individual-tracker/types";
import { GameSelectionDialog } from "../game-selection-dialog";

afterEach(() => {
  cleanup();
});

describe("GameSelectionDialog", () => {
  it("syncs selected matches when closed", async () => {
    const enrichedResponse: TrackerMatchHistoryResponse = {
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
          startTime: "Jan 2, 2026, 12:00:00 AM",
          endTime: "Jan 2, 2026, 12:10:00 AM",
          mapAssetId: "map-2",
          modeAssetId: "mode-2",
          duration: "10m 0s",
          mapName: "Bazaar",
          modeName: "Capture the Flag",
          outcome: "Loss",
          resultString: "Loss - 3:5",
          isMatchmaking: true,
          category: "matchmaking",
          teams: [],
          mapThumbnailUrl: "data:,",
        },
      ],
      suggestedGroupings: [],
    };

    const onLoadEnrichedMatches = vi.fn(async () => Promise.resolve(enrichedResponse));
    const onSync = vi.fn(async () => Promise.resolve());
    const onClose = vi.fn();

    render(
      <GameSelectionDialog
        isOpen={true}
        busy={false}
        trackerLabel="Test Gamertag"
        trackerId="tracker-1"
        xuid="xuid-1"
        initialSelectedMatchIds={["match-1"]}
        initialGroupings={[]}
        onClose={onClose}
        onLoadEnrichedMatches={onLoadEnrichedMatches}
        onSync={onSync}
      />,
    );

    await waitFor(() => {
      expect(onLoadEnrichedMatches).toHaveBeenCalledWith("xuid-1", 0, 25);
    });

    const matchCheckboxes = screen.getAllByRole("checkbox").filter((element) => element.id.startsWith("match-"));
    const [match1Checkbox, match2Checkbox] = matchCheckboxes;

    // Uncheck match-1 (already selected), check match-2
    fireEvent.click(match1Checkbox);
    fireEvent.click(match2Checkbox);

    fireEvent.click(screen.getByRole("button", { name: /close and sync/i }));

    await waitFor(() => {
      expect(onSync).toHaveBeenCalledWith({
        trackerId: "tracker-1",
        selectedMatchIds: ["match-2"],
        matchGroupings: [],
        matches: enrichedResponse.matches,
      });
    });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("hides short matches by default and reveals them when the filter is disabled", async () => {
    const enrichedResponse: TrackerMatchHistoryResponse = {
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
          startTime: "Jan 1, 2026, 12:02:00 AM",
          endTime: "Jan 1, 2026, 12:12:00 AM",
          mapAssetId: "map-long",
          modeAssetId: "mode-long",
          duration: "10m 0s",
          mapName: "Bazaar",
          modeName: "Capture the Flag",
          outcome: "Loss",
          resultString: "Loss - 3:5",
          isMatchmaking: true,
          category: "matchmaking",
          teams: [],
          mapThumbnailUrl: "data:,",
        },
      ],
      suggestedGroupings: [],
    };

    render(
      <GameSelectionDialog
        isOpen={true}
        busy={false}
        trackerLabel="Test Gamertag"
        trackerId="tracker-1"
        xuid="xuid-1"
        initialSelectedMatchIds={[]}
        initialGroupings={[]}
        onClose={vi.fn()}
        onLoadEnrichedMatches={vi.fn(async () => Promise.resolve(enrichedResponse))}
        onSync={vi.fn(async () => Promise.resolve())}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("Slayer: Aquarius")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Capture the Flag: Bazaar")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Hide games < 2m duration"));

    expect(screen.getByText("Slayer: Aquarius")).toBeInTheDocument();
  });
});
