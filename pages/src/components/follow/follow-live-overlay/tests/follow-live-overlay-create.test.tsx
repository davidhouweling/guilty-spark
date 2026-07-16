import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import { aDirectoryWith, aTrackerWith } from "@guilty-spark/shared/contracts/individual-tracker/fakes/follow.fake";
import { aFakeHaloClientWith } from "../../../../services/fakes/halo-client.fake";
import { aFakeFollowLiveServiceWith } from "../../../../services/follow/fakes/follow.fake";
import { HaloMedalMetadataResolver } from "../../../../services/halo/medal-metadata-resolver";
import { aFakeIndividualTrackerViewServiceWith } from "../../../../services/individual-tracker/fakes/view.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../../services/stats/fakes/match-analytics.fake";
import { aFakeSeriesMatchesServiceWith } from "../../../../services/stats/fakes/series-matches.fake";
import { createFollowLiveOverlay } from "../create";

let mockOverlayInstanceCount = 0;

vi.mock("../../../individual-tracker/overlay/create", () => ({
  createIndividualTrackerOverlayPage: () => {
    return function MockIndividualTrackerOverlayPage({
      trackerId,
      externalView,
      showPreview,
      previewMode,
    }: {
      trackerId: string;
      externalView?: TrackerViewState;
      showPreview?: boolean;
      previewMode?: "player" | "observer";
    }): React.ReactElement {
      const [instanceId] = React.useState(() => {
        mockOverlayInstanceCount += 1;
        return mockOverlayInstanceCount;
      });

      return (
        <div data-testid="mock-overlay-page" data-instance-id={instanceId.toString()}>
          {`${trackerId}:${String(showPreview)}:${previewMode ?? "observer"}`}
          <span data-testid="mock-overlay-external-view-tracker-id">{externalView?.trackerId ?? "none"}</span>
        </div>
      );
    };
  },
}));

function createFollowLiveOverlayWith(
  directory: TrackerDirectory,
  options: { readonly showPreview?: boolean; readonly previewMode?: "player" | "observer" } = {},
  followLiveService = aFakeFollowLiveServiceWith({ directory }),
  individualTrackerViewService = aFakeIndividualTrackerViewServiceWith(),
): {
  readonly element: React.ReactElement;
  readonly followLiveService: ReturnType<typeof aFakeFollowLiveServiceWith>;
  readonly individualTrackerViewService: ReturnType<typeof aFakeIndividualTrackerViewServiceWith>;
} {
  const haloClient = aFakeHaloClientWith();
  const FollowLiveOverlay = createFollowLiveOverlay({
    followLiveService,
    individualTrackerViewService,
    matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
    seriesMatchesService: aFakeSeriesMatchesServiceWith(),
    haloClient,
    medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
  });

  return {
    element: (
      <FollowLiveOverlay
        gamertag="Spartan One"
        showPreview={options.showPreview ?? false}
        previewMode={options.previewMode ?? "observer"}
      />
    ),
    followLiveService,
    individualTrackerViewService,
  };
}

describe("FollowLiveOverlayCreate", () => {
  afterEach(() => {
    cleanup();
    document.title = "";
    mockOverlayInstanceCount = 0;
  });

  it("renders the overlay page for the selected live tracker", async () => {
    const directory = aDirectoryWith({
      trackers: [
        aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: false, status: "active" }),
        aTrackerWith({ trackerId: "tracker-2", gamertag: "Spartan Two", isLive: true, status: "active" }),
      ],
      liveTrackerId: "tracker-2",
    });

    render(createFollowLiveOverlayWith(directory).element);

    await waitFor(() => {
      expect(screen.getByTestId("mock-overlay-page")).toHaveTextContent("tracker-2:false:observer");
    });

    expect(screen.getByTestId("mock-overlay-external-view-tracker-id")).toHaveTextContent("tracker-2");
    expect(screen.getByAltText("Connection healthy")).toBeInTheDocument();
  });

  it("forwards preview flags to the overlay page", async () => {
    const directory = aDirectoryWith({
      trackers: [aTrackerWith({ trackerId: "tracker-3", gamertag: "Spartan Three", isLive: true, status: "active" })],
      liveTrackerId: "tracker-3",
    });

    render(createFollowLiveOverlayWith(directory, { showPreview: true, previewMode: "player" }).element);

    await waitFor(() => {
      expect(screen.getByTestId("mock-overlay-page")).toHaveTextContent("tracker-3:true:player");
    });
  });

  it("shows waiting state when no active tracker is available", async () => {
    const directory = aDirectoryWith({
      trackers: [aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: false, status: "paused" })],
      liveTrackerId: null,
    });

    render(createFollowLiveOverlayWith(directory).element);

    await waitFor(() => {
      expect(screen.getByText("No active tracker — waiting for a live game")).toBeInTheDocument();
    });
  });

  it("does not render overlay for active tracker when no tracker is live", async () => {
    const directory = aDirectoryWith({
      trackers: [aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: false, status: "active" })],
      liveTrackerId: null,
    });

    render(createFollowLiveOverlayWith(directory).element);

    await waitFor(() => {
      expect(screen.getByText("No active tracker — waiting for a live game")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("mock-overlay-page")).not.toBeInTheDocument();
  });

  it("does not remount overlay when only selected tracker last update time changes", async () => {
    const initialDirectory: TrackerDirectory = aDirectoryWith({
      trackers: [
        aTrackerWith({
          trackerId: "tracker-1",
          gamertag: "Spartan One",
          isLive: true,
          status: "active",
          lastUpdateTime: "2026-01-01T00:00:00.000Z",
        }),
      ],
      liveTrackerId: "tracker-1",
    });
    const { element, followLiveService } = createFollowLiveOverlayWith(initialDirectory);

    render(element);

    await waitFor(() => {
      expect(screen.getByTestId("mock-overlay-page")).toHaveAttribute("data-instance-id", "1");
    });

    const updatedDirectory: TrackerDirectory = {
      ...initialDirectory,
      trackers: [
        {
          ...initialDirectory.trackers[0],
          lastUpdateTime: "2026-01-01T00:01:00.000Z",
        },
      ],
    };

    act(() => {
      followLiveService.lastConnection?.emitDirectory(updatedDirectory);
    });

    await waitFor(() => {
      expect(screen.getByTestId("mock-overlay-page")).toHaveAttribute("data-instance-id", "1");
    });
  });

  it("does not call owner-only tracker view service methods in follow overlay mode", async () => {
    const directory = aDirectoryWith({
      trackers: [aTrackerWith({ trackerId: "tracker-3", gamertag: "Spartan Three", isLive: true, status: "active" })],
      liveTrackerId: "tracker-3",
    });
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith();
    const getViewSpy = vi.spyOn(individualTrackerViewService, "getView");
    const connectSpy = vi.spyOn(individualTrackerViewService, "connect");

    render(
      createFollowLiveOverlayWith(
        directory,
        { showPreview: false, previewMode: "observer" },
        aFakeFollowLiveServiceWith({ directory }),
        individualTrackerViewService,
      ).element,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mock-overlay-page")).toBeInTheDocument();
    });

    expect(getViewSpy).not.toHaveBeenCalled();
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it("swaps to degraded icon when follow directory connection status errors", async () => {
    const directory = aDirectoryWith({
      trackers: [aTrackerWith({ trackerId: "tracker-3", gamertag: "Spartan Three", isLive: true, status: "active" })],
      liveTrackerId: "tracker-3",
    });
    const { element, followLiveService } = createFollowLiveOverlayWith(directory);

    render(element);

    await waitFor(() => {
      expect(screen.getByAltText("Connection healthy")).toBeInTheDocument();
    });

    act(() => {
      followLiveService.lastConnection?.emitStatus("error", "Connection lost");
    });

    await waitFor(() => {
      expect(screen.getByAltText("Connection issue")).toBeInTheDocument();
    });
  });
});
