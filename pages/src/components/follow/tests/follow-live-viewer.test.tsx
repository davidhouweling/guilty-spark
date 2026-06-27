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
import { FollowLiveViewer, type FollowLiveViewerProps } from "../follow-live-viewer";

vi.mock("../../individual-tracker/viewer/create", () => ({
  IndividualTrackerViewerPage: ({ trackerId }: { trackerId: string }): React.ReactElement => (
    <div data-testid="mock-viewer">{trackerId}</div>
  ),
}));

function aViewerPropsWith(directory: TrackerDirectory): FollowLiveViewerProps {
  return {
    gamertag: "Spartan One",
    followLiveService: aFakeFollowLiveServiceWith({ directory }),
    individualTrackerViewService: aFakeIndividualTrackerViewServiceWith(),
    matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
    seriesMatchesService: aFakeSeriesMatchesServiceWith(),
    haloClient: aFakeHaloClientWith(),
  };
}

describe("FollowLiveViewer", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows tracker navigation when directory has multiple trackers", async () => {
    render(<FollowLiveViewer {...aViewerPropsWith(aDirectoryWith())} />);

    await waitFor(() => {
      expect(screen.getByTestId("mock-viewer")).toBeInTheDocument();
    });

    const trackerButtons = screen.getAllByRole("button", { name: /Spartan/ });
    expect(trackerButtons).toHaveLength(2);
  });

  it("does not show tracker navigation when directory has a single tracker", async () => {
    const singleDirectory: TrackerDirectory = aDirectoryWith({
      trackers: [aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: true, status: "active" })],
      liveTrackerId: "tracker-1",
    });

    render(<FollowLiveViewer {...aViewerPropsWith(singleDirectory)} />);

    await waitFor(() => {
      expect(screen.getByTestId("mock-viewer")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /Spartan/ })).toBeNull();
  });

  it("shows no active tracker message while still rendering tabs when all trackers are inactive", async () => {
    const inactiveDirectory: TrackerDirectory = aDirectoryWith({
      trackers: [
        aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", status: "paused", isLive: false }),
        aTrackerWith({ trackerId: "tracker-2", gamertag: "Spartan Two", status: "stopped", isLive: false }),
      ],
      liveTrackerId: null,
    });

    render(<FollowLiveViewer {...aViewerPropsWith(inactiveDirectory)} />);

    await waitFor(() => {
      expect(screen.getByText("No active tracker — waiting for a live game")).toBeInTheDocument();
    });

    const trackerButtons = screen.getAllByRole("button", { name: /Spartan/ });
    expect(trackerButtons).toHaveLength(2);
    expect(screen.queryByTestId("mock-viewer")).toBeNull();
  });
});
