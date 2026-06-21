import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  IndividualTrackerService,
  TrackerMatchHistoryResponse,
} from "../../../../services/individual-tracker/types";
import { FakeIndividualTrackerService } from "../../../../services/individual-tracker/fakes/individual-tracker.fake";
import { GameSelectionDialogSection } from "../create";

afterEach(() => {
  cleanup();
});

function aResponse(overrides: Partial<TrackerMatchHistoryResponse> = {}): TrackerMatchHistoryResponse {
  return {
    matches: [],
    suggestedGroupings: [],
    ...overrides,
  };
}

function aMatch(
  matchId: string,
  category: "custom" | "matchmaking" = "custom",
): TrackerMatchHistoryResponse["matches"][number] {
  return {
    matchId,
    startTime: "Jan 1, 2026, 12:00:00 AM",
    endTime: "Jan 1, 2026, 12:10:00 AM",
    mapAssetId: `map-${matchId}`,
    mapVersionId: `map-version-${matchId}`,
    modeAssetId: `mode-${matchId}`,
    modeVersionId: `mode-version-${matchId}`,
    gameVariantCategory: 6,
    duration: "10m 0s",
    mapName: "Aquarius",
    modeName: "Slayer",
    outcome: "Win",
    resultString: "Win - 50:40",
    isMatchmaking: category === "matchmaking",
    category,
    teams: [],
    mapThumbnailUrl: "data:,",
  };
}

describe("GameSelectionDialogSection", () => {
  it("shows a single loading state while initial matches are being fetched", () => {
    const service = new FakeIndividualTrackerService();
    vi.spyOn(service, "getMatchHistory").mockImplementation(
      async () =>
        new Promise(() => {
          /* keep pending */
        }),
    );

    render(
      <GameSelectionDialogSection
        isOpen={true}
        trackerId="tracker-1"
        trackerLabel="Test Player"
        xuid="xuid-1"
        initialSelectedMatchIds={[]}
        initialGroupings={[]}
        initialSeriesGroups={[]}
        onClose={vi.fn()}
        onSynced={vi.fn()}
        individualTrackerService={service as IndividualTrackerService}
      />,
    );

    expect(screen.getByText("Loading matches...")).toBeInTheDocument();
    expect(screen.getAllByText("Loading matches...")).toHaveLength(1);
    expect(screen.queryByText("Establishing Connection...")).not.toBeInTheDocument();
  });

  it("shows error alert and hides match list when getMatchHistory fails", async () => {
    const service = new FakeIndividualTrackerService();
    vi.spyOn(service, "getMatchHistory").mockRejectedValue(new Error("Network error"));

    render(
      <GameSelectionDialogSection
        isOpen={true}
        trackerId="tracker-1"
        trackerLabel="Test Player"
        xuid="xuid-1"
        initialSelectedMatchIds={[]}
        initialGroupings={[]}
        initialSeriesGroups={[]}
        onClose={vi.fn()}
        onSynced={vi.fn()}
        individualTrackerService={service as IndividualTrackerService}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
    expect(screen.queryByText("Establishing Connection...")).not.toBeInTheDocument();
    expect(screen.queryByText("No matches found")).not.toBeInTheDocument();
  });

  it("loads and displays matches when opened", async () => {
    const service = new FakeIndividualTrackerService();
    vi.spyOn(service, "getMatchHistory").mockResolvedValue(aResponse({ matches: [aMatch("m1"), aMatch("m2")] }));

    render(
      <GameSelectionDialogSection
        isOpen={true}
        trackerId="tracker-1"
        trackerLabel="Test Player"
        xuid="xuid-1"
        initialSelectedMatchIds={[]}
        initialGroupings={[]}
        initialSeriesGroups={[]}
        onClose={vi.fn()}
        onSynced={vi.fn()}
        individualTrackerService={service as IndividualTrackerService}
      />,
    );

    await waitFor(() => {
      expect(screen.queryAllByRole("checkbox").length).toBeGreaterThan(0);
    });
  });

  it("hides short matches by default and reveals them when the filter is disabled", async () => {
    const service = new FakeIndividualTrackerService();
    vi.spyOn(service, "getMatchHistory").mockResolvedValue(
      aResponse({
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
      }),
    );

    render(
      <GameSelectionDialogSection
        isOpen={true}
        trackerId="tracker-1"
        trackerLabel="Test Player"
        xuid="xuid-1"
        initialSelectedMatchIds={[]}
        initialGroupings={[]}
        initialSeriesGroups={[]}
        onClose={vi.fn()}
        onSynced={vi.fn()}
        individualTrackerService={service as IndividualTrackerService}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("Slayer: Aquarius")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Capture the Flag: Bazaar")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Hide games < 2m duration"));

    expect(screen.getByText("Slayer: Aquarius")).toBeInTheDocument();
  });

  it("calls syncMatchesToTracker only when footer sync button is clicked", async () => {
    const service = new FakeIndividualTrackerService();
    vi.spyOn(service, "getMatchHistory").mockResolvedValue(aResponse({ matches: [aMatch("m1")] }));
    const syncSpy = vi.spyOn(service, "syncMatchesToTracker").mockResolvedValue(undefined);
    const onSynced = vi.fn();

    render(
      <GameSelectionDialogSection
        isOpen={true}
        trackerId="tracker-1"
        trackerLabel="Test Player"
        xuid="xuid-1"
        initialSelectedMatchIds={["m1"]}
        initialGroupings={[]}
        initialSeriesGroups={[]}
        onClose={vi.fn()}
        onSynced={onSynced}
        individualTrackerService={service as IndividualTrackerService}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(syncSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          trackerId: "tracker-1",
          selectedMatchIds: ["m1"],
        }),
      );
    });
    expect(onSynced).toHaveBeenCalledOnce();
  });

  it("treats escape close as cancel and does not sync", async () => {
    const service = new FakeIndividualTrackerService();
    vi.spyOn(service, "getMatchHistory").mockResolvedValue(aResponse({ matches: [aMatch("m1")] }));
    const syncSpy = vi.spyOn(service, "syncMatchesToTracker").mockResolvedValue(undefined);
    const onSynced = vi.fn();
    const onClose = vi.fn();

    render(
      <GameSelectionDialogSection
        isOpen={true}
        trackerId="tracker-1"
        trackerLabel="Test Player"
        xuid="xuid-1"
        initialSelectedMatchIds={["m1"]}
        initialGroupings={[]}
        initialSeriesGroups={[]}
        onClose={onClose}
        onSynced={onSynced}
        individualTrackerService={service as IndividualTrackerService}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
    expect(syncSpy).not.toHaveBeenCalled();
    expect(onSynced).not.toHaveBeenCalled();
  });
});
