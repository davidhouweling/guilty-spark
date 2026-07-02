import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import { aDirectoryWith, aTrackerWith } from "@guilty-spark/shared/contracts/individual-tracker/fakes/follow.fake";
import { aFakeHaloClientWith } from "../../../services/fakes/halo-client.fake";
import { aFakeFollowLiveServiceWith } from "../../../services/follow/fakes/follow.fake";
import { aFakeIndividualTrackerViewServiceWith } from "../../../services/individual-tracker/fakes/view.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../services/stats/fakes/match-analytics.fake";
import { aFakeSeriesMatchesServiceWith } from "../../../services/stats/fakes/series-matches.fake";
import { FollowLiveOverlayViewer, type FollowLiveOverlayViewerProps } from "../follow-live-overlay-viewer";

vi.mock("../../individual-tracker/overlay/create", () => ({
  IndividualTrackerOverlayPage: ({
    trackerId,
    showPreview,
    previewMode,
  }: {
    trackerId: string;
    showPreview?: boolean;
    previewMode?: "player" | "observer";
  }): React.ReactElement => <div data-testid="mock-overlay-page">{`${trackerId}:${String(showPreview)}:${previewMode ?? "observer"}`}</div>,
}));

function aViewerPropsWith(directory: TrackerDirectory): FollowLiveOverlayViewerProps {
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

describe("FollowLiveOverlayViewer", () => {
  afterEach(() => {
    cleanup();
    document.title = "";
  });

  it("renders the overlay page for the selected live tracker", async () => {
    const directory = aDirectoryWith({
      trackers: [
        aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: false, status: "active" }),
        aTrackerWith({ trackerId: "tracker-2", gamertag: "Spartan Two", isLive: true, status: "active" }),
      ],
      liveTrackerId: "tracker-2",
    });

    render(<FollowLiveOverlayViewer {...aViewerPropsWith(directory)} />);

    await waitFor(() => {
      expect(screen.getByTestId("mock-overlay-page")).toHaveTextContent("tracker-2:false:observer");
    });
  });

  it("forwards preview flags to the overlay page", async () => {
    const directory = aDirectoryWith({
      trackers: [aTrackerWith({ trackerId: "tracker-3", gamertag: "Spartan Three", isLive: true, status: "active" })],
      liveTrackerId: "tracker-3",
    });

    render(<FollowLiveOverlayViewer {...aViewerPropsWith(directory)} showPreview previewMode="player" />);

    await waitFor(() => {
      expect(screen.getByTestId("mock-overlay-page")).toHaveTextContent("tracker-3:true:player");
    });
  });

  it("shows waiting state when no active tracker is available", async () => {
    const directory = aDirectoryWith({
      trackers: [aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: false, status: "paused" })],
      liveTrackerId: null,
    });

    render(<FollowLiveOverlayViewer {...aViewerPropsWith(directory)} />);

    await waitFor(() => {
      expect(screen.getByText("No active tracker — waiting for a live game")).toBeInTheDocument();
    });
  });

  it("does not render overlay for active tracker when no tracker is live", async () => {
    const directory = aDirectoryWith({
      trackers: [aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: false, status: "active" })],
      liveTrackerId: null,
    });

    render(<FollowLiveOverlayViewer {...aViewerPropsWith(directory)} />);

    await waitFor(() => {
      expect(screen.getByText("No active tracker — waiting for a live game")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("mock-overlay-page")).not.toBeInTheDocument();
  });
});
