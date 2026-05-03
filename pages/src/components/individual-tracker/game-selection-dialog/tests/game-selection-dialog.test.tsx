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
          mapVersionId: "map-version-1",
          modeAssetId: "mode-1",
          modeVersionId: "mode-version-1",
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
        },
        {
          matchId: "match-2",
          startTime: "Jan 2, 2026, 12:00:00 AM",
          endTime: "Jan 2, 2026, 12:10:00 AM",
          mapAssetId: "map-2",
          mapVersionId: "map-version-2",
          modeAssetId: "mode-2",
          modeVersionId: "mode-version-2",
          gameVariantCategory: 6,
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
        initialSeriesGroups={[]}
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
        seriesGroups: [],
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
          startTimeIso: "2026-01-01T00:00:00.000Z",
          endTimeIso: "2026-01-01T00:01:30.000Z",
          mapAssetId: "map-short",
          mapVersionId: "map-version-short",
          modeAssetId: "mode-short",
          modeVersionId: "mode-version-short",
          gameVariantCategory: 6,
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
          startTimeIso: "2026-01-01T00:02:00.000Z",
          endTimeIso: "2026-01-01T00:12:00.000Z",
          mapAssetId: "map-long",
          mapVersionId: "map-version-long",
          modeAssetId: "mode-long",
          modeVersionId: "mode-version-long",
          gameVariantCategory: 6,
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
        initialSeriesGroups={[]}
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

  it("includes edited series labels when syncing grouped matches", async () => {
    const enrichedResponse: TrackerMatchHistoryResponse = {
      matches: [
        {
          matchId: "match-1",
          startTime: "Jan 1, 2026, 12:00:00 AM",
          endTime: "Jan 1, 2026, 12:10:00 AM",
          mapAssetId: "map-1",
          mapVersionId: "map-version-1",
          modeAssetId: "mode-1",
          modeVersionId: "mode-version-1",
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
        },
        {
          matchId: "match-2",
          startTime: "Jan 1, 2026, 12:15:00 AM",
          endTime: "Jan 1, 2026, 12:25:00 AM",
          mapAssetId: "map-2",
          mapVersionId: "map-version-2",
          modeAssetId: "mode-2",
          modeVersionId: "mode-version-2",
          gameVariantCategory: 6,
          duration: "10m 0s",
          mapName: "Bazaar",
          modeName: "Slayer",
          outcome: "Loss",
          resultString: "Loss - 40:50",
          isMatchmaking: false,
          category: "custom",
          teams: [],
          mapThumbnailUrl: "data:,",
        },
      ],
      suggestedGroupings: [["match-1", "match-2"]],
    };

    const onSync = vi.fn(async () => Promise.resolve());

    render(
      <GameSelectionDialog
        isOpen={true}
        busy={false}
        trackerLabel="Test Gamertag"
        trackerId="tracker-1"
        xuid="xuid-1"
        initialSelectedMatchIds={["match-1", "match-2"]}
        initialGroupings={[["match-1", "match-2"]]}
        initialSeriesGroups={[]}
        onClose={vi.fn()}
        onLoadEnrichedMatches={vi.fn(async () => Promise.resolve(enrichedResponse))}
        onSync={onSync}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Series 1 title")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Deselect matches in series" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Series 1 title"), { target: { value: "Dog Crew" } });
    fireEvent.change(screen.getByLabelText("Series 1 subtitle"), { target: { value: "Queue #7" } });
    fireEvent.click(screen.getByRole("button", { name: /close and sync/i }));

    await waitFor(() => {
      expect(onSync).toHaveBeenCalledWith(
        expect.objectContaining({
          seriesGroups: [
            {
              matchIds: ["match-1", "match-2"],
              titleOverride: "Dog Crew",
              subtitleOverride: "Queue #7",
            },
          ],
        }),
      );
    });
  });

  it("updates visible series counts and default best-of text when short games are hidden", async () => {
    const enrichedResponse: TrackerMatchHistoryResponse = {
      matches: [
        {
          matchId: "match-short",
          startTime: "Jan 1, 2026, 12:00:00 AM",
          endTime: "Jan 1, 2026, 12:01:30 AM",
          startTimeIso: "2026-01-01T00:00:00.000Z",
          endTimeIso: "2026-01-01T00:01:30.000Z",
          mapAssetId: "map-shared",
          mapVersionId: "map-version-shared",
          modeAssetId: "mode-short",
          modeVersionId: "mode-version-short",
          gameVariantCategory: 6,
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
          startTimeIso: "2026-01-01T00:02:00.000Z",
          endTimeIso: "2026-01-01T00:12:00.000Z",
          mapAssetId: "map-shared",
          mapVersionId: "map-version-shared",
          modeAssetId: "mode-long",
          modeVersionId: "mode-version-long",
          gameVariantCategory: 6,
          duration: "10m 0s",
          mapName: "Bazaar",
          modeName: "Slayer",
          outcome: "Loss",
          resultString: "Loss - 3:5",
          isMatchmaking: false,
          category: "custom",
          teams: [],
          mapThumbnailUrl: "data:,",
        },
      ],
      suggestedGroupings: [["match-short", "match-long"]],
    };

    render(
      <GameSelectionDialog
        isOpen={true}
        busy={false}
        trackerLabel="Test Gamertag"
        trackerId="tracker-1"
        xuid="xuid-1"
        initialSelectedMatchIds={[]}
        initialGroupings={[["match-short", "match-long"]]}
        initialSeriesGroups={[]}
        onClose={vi.fn()}
        onLoadEnrichedMatches={vi.fn(async () => Promise.resolve(enrichedResponse))}
        onSync={vi.fn(async () => Promise.resolve())}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("1 games")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Series 1 subtitle")).toHaveAttribute("placeholder", "Best of 1");

    fireEvent.click(screen.getByLabelText("Hide games < 2m duration"));

    expect(screen.getByText("2 games")).toBeInTheDocument();
    expect(screen.getByLabelText("Series 1 subtitle")).toHaveAttribute("placeholder", "Best of 1");
  });
});
