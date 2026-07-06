import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import { aDirectoryWith, aTrackerWith } from "@guilty-spark/shared/contracts/individual-tracker/fakes/follow.fake";
import { aFakeHaloClientWith } from "../../../../services/fakes/halo-client.fake";
import { aFakeFollowLiveServiceWith } from "../../../../services/follow/fakes/follow.fake";
import { aFakeIndividualTrackerViewServiceWith } from "../../../../services/individual-tracker/fakes/view.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../../services/stats/fakes/match-analytics.fake";
import { aFakeSeriesMatchesServiceWith } from "../../../../services/stats/fakes/series-matches.fake";
import { FollowLiveOverlayCreate, type FollowLiveOverlayCreateProps } from "../create";

let mockOverlayInstanceCount = 0;

vi.mock("../../../individual-tracker/overlay/create", () => ({
  IndividualTrackerOverlayPage: ({
    trackerId,
    externalView,
    showPreview,
    previewMode,
  }: {
    trackerId: string;
    externalView?: TrackerViewState;
    showPreview?: boolean;
    previewMode?: "player" | "observer";
  }): React.ReactElement => {
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
  },
}));

function aViewerPropsWith(directory: TrackerDirectory): FollowLiveOverlayCreateProps {
  return {
    gamertag: "Spartan One",
    followLiveService: aFakeFollowLiveServiceWith({ directory }),
    individualTrackerViewService: aFakeIndividualTrackerViewServiceWith(),
    matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
    seriesMatchesService: aFakeSeriesMatchesServiceWith(),
    haloClient: aFakeHaloClientWith(),
    showPreview: false,
    previewMode: "observer",
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

    render(<FollowLiveOverlayCreate {...aViewerPropsWith(directory)} />);

    await waitFor(() => {
      expect(screen.getByTestId("mock-overlay-page")).toHaveTextContent("tracker-2:false:observer");
    });

    expect(screen.getByTestId("mock-overlay-external-view-tracker-id")).toHaveTextContent("tracker-2");
  });

  it("forwards preview flags to the overlay page", async () => {
    const directory = aDirectoryWith({
      trackers: [aTrackerWith({ trackerId: "tracker-3", gamertag: "Spartan Three", isLive: true, status: "active" })],
      liveTrackerId: "tracker-3",
    });

    render(<FollowLiveOverlayCreate {...aViewerPropsWith(directory)} showPreview previewMode="player" />);

    await waitFor(() => {
      expect(screen.getByTestId("mock-overlay-page")).toHaveTextContent("tracker-3:true:player");
    });
  });

  it("shows waiting state when no active tracker is available", async () => {
    const directory = aDirectoryWith({
      trackers: [aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: false, status: "paused" })],
      liveTrackerId: null,
    });

    render(<FollowLiveOverlayCreate {...aViewerPropsWith(directory)} />);

    await waitFor(() => {
      expect(screen.getByText("No active tracker — waiting for a live game")).toBeInTheDocument();
    });
  });

  it("does not render overlay for active tracker when no tracker is live", async () => {
    const directory = aDirectoryWith({
      trackers: [aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: false, status: "active" })],
      liveTrackerId: null,
    });

    render(<FollowLiveOverlayCreate {...aViewerPropsWith(directory)} />);

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
    const followLiveService = aFakeFollowLiveServiceWith({ directory: initialDirectory });

    render(
      <FollowLiveOverlayCreate
        gamertag="Spartan One"
        followLiveService={followLiveService}
        individualTrackerViewService={aFakeIndividualTrackerViewServiceWith()}
        matchAnalyticsService={aFakeMatchAnalyticsServiceWith()}
        seriesMatchesService={aFakeSeriesMatchesServiceWith()}
        haloClient={aFakeHaloClientWith()}
      />,
    );

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
});
