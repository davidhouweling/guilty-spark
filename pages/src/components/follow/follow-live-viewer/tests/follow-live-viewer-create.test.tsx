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
import { createFollowLiveViewer } from "../create";

let mockViewerInstanceCount = 0;

vi.mock("../../../individual-tracker/viewer/create", () => ({
  IndividualTrackerViewerPage: ({
    trackerId,
    streamerSettings,
    externalView,
    connectionStatusOverride,
  }: {
    trackerId: string;
    streamerSettings?: TrackerDirectory["streamerSettings"];
    externalView?: TrackerViewState;
    connectionStatusOverride?: string;
  }): React.ReactElement => {
    const [instanceId] = React.useState(() => {
      mockViewerInstanceCount += 1;
      return mockViewerInstanceCount;
    });

    return (
      <div data-testid="mock-viewer" data-instance-id={instanceId.toString()}>
        {trackerId}
        <span data-testid="mock-streamer-settings">
          {streamerSettings?.styleFlags?.matchmakingMyStatsOnly === true ? "true" : "false"}
        </span>
        <span data-testid="mock-external-view-tracker-id">{externalView?.trackerId ?? "none"}</span>
        <span data-testid="mock-external-view-streamer-settings">
          {externalView?.streamerSettings?.styleFlags?.matchmakingMyStatsOnly === true ? "true" : "false"}
        </span>
        <span data-testid="mock-connection-status-override">{connectionStatusOverride ?? "none"}</span>
      </div>
    );
  },
}));

function createFollowLiveViewerWith(
  directory: TrackerDirectory,
  followLiveService = aFakeFollowLiveServiceWith({ directory }),
  individualTrackerViewService = aFakeIndividualTrackerViewServiceWith(),
): {
  readonly element: React.ReactElement;
  readonly followLiveService: ReturnType<typeof aFakeFollowLiveServiceWith>;
  readonly individualTrackerViewService: ReturnType<typeof aFakeIndividualTrackerViewServiceWith>;
} {
  const FollowLiveViewer = createFollowLiveViewer({
    followLiveService,
    individualTrackerViewService,
    matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
    seriesMatchesService: aFakeSeriesMatchesServiceWith(),
    haloClient: aFakeHaloClientWith(),
  });

  return {
    element: <FollowLiveViewer gamertag="Spartan One" />,
    followLiveService,
    individualTrackerViewService,
  };
}

describe("FollowLiveViewerCreate", () => {
  afterEach(() => {
    cleanup();
    document.title = "";
    mockViewerInstanceCount = 0;
  });

  it("shows tracker navigation when directory has multiple trackers", async () => {
    render(createFollowLiveViewerWith(aDirectoryWith()).element);

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

    render(createFollowLiveViewerWith(singleDirectory).element);

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

    render(createFollowLiveViewerWith(inactiveDirectory).element);

    await waitFor(() => {
      expect(screen.getByText("No active tracker — waiting for a live game")).toBeInTheDocument();
    });

    const trackerButtons = screen.getAllByRole("button", { name: /Spartan/ });
    expect(trackerButtons).toHaveLength(2);
    expect(screen.queryByTestId("mock-viewer")).toBeNull();
  });

  it("passes directory streamer settings into the viewer page", async () => {
    const directoryWithSettings: TrackerDirectory = aDirectoryWith({
      streamerSettings: {
        styleFlags: {
          matchmakingMyStatsOnly: true,
        },
      },
    });

    render(createFollowLiveViewerWith(directoryWithSettings).element);

    await waitFor(() => {
      expect(screen.getByTestId("mock-viewer")).toBeInTheDocument();
    });

    expect(screen.getByTestId("mock-streamer-settings")).toHaveTextContent("true");
    expect(screen.getByTestId("mock-external-view-streamer-settings")).toHaveTextContent("true");
  });

  it("passes selected tracker as external view", async () => {
    const directory: TrackerDirectory = aDirectoryWith({
      trackers: [
        aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: false, status: "active" }),
        aTrackerWith({ trackerId: "tracker-2", gamertag: "Spartan Two", isLive: true, status: "active" }),
      ],
      liveTrackerId: "tracker-2",
    });

    render(createFollowLiveViewerWith(directory).element);

    await waitFor(() => {
      expect(screen.getByTestId("mock-viewer")).toBeInTheDocument();
    });

    expect(screen.getByTestId("mock-external-view-tracker-id")).toHaveTextContent("tracker-2");
  });

  it("updates the document title to mention the current live tracker", async () => {
    const liveDirectory: TrackerDirectory = aDirectoryWith({
      trackers: [
        aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: false, status: "active" }),
        aTrackerWith({ trackerId: "tracker-2", gamertag: "Spartan Two", isLive: true, status: "active" }),
      ],
      liveTrackerId: "tracker-2",
    });

    render(createFollowLiveViewerWith(liveDirectory).element);

    await waitFor(() => {
      expect(document.title).toBe("Spartan One live view - Spartan Two live - Guilty Spark");
    });
  });

  it("does not remount the selected viewer when only the selected tracker last update time changes", async () => {
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
    const { element, followLiveService } = createFollowLiveViewerWith(initialDirectory);

    render(element);

    await waitFor(() => {
      expect(screen.getByTestId("mock-viewer")).toHaveAttribute("data-instance-id", "1");
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
      expect(screen.getByTestId("mock-viewer")).toHaveAttribute("data-instance-id", "1");
    });
  });

  it("passes connecting status override when follow directory is reconnecting", async () => {
    const initialDirectory: TrackerDirectory = aDirectoryWith({
      trackers: [
        aTrackerWith({
          trackerId: "tracker-1",
          gamertag: "Spartan One",
          isLive: true,
          status: "active",
        }),
      ],
      liveTrackerId: "tracker-1",
    });
    const { element, followLiveService } = createFollowLiveViewerWith(initialDirectory);

    render(element);

    await waitFor(() => {
      expect(screen.getByTestId("mock-connection-status-override")).toHaveTextContent("none");
    });

    act(() => {
      followLiveService.lastConnection?.emitStatus("connecting");
    });

    await waitFor(() => {
      expect(screen.getByTestId("mock-connection-status-override")).toHaveTextContent("connecting");
    });
  });

  it("does not call owner-only tracker view service methods in follow viewer mode", async () => {
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith();
    const getViewSpy = vi.spyOn(individualTrackerViewService, "getView");
    const connectSpy = vi.spyOn(individualTrackerViewService, "connect");

    render(
      createFollowLiveViewerWith(
        aDirectoryWith(),
        aFakeFollowLiveServiceWith({ directory: aDirectoryWith() }),
        individualTrackerViewService,
      ).element,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mock-viewer")).toBeInTheDocument();
    });

    expect(getViewSpy).not.toHaveBeenCalled();
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it("recovers after websocket error and resumes updates from later directory pushes", async () => {
    const initialDirectory: TrackerDirectory = aDirectoryWith({
      trackers: [
        aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: true, status: "active" }),
        aTrackerWith({ trackerId: "tracker-2", gamertag: "Spartan Two", isLive: false, status: "active" }),
      ],
      liveTrackerId: "tracker-1",
    });
    const { element, followLiveService } = createFollowLiveViewerWith(initialDirectory);

    render(element);

    await waitFor(() => {
      expect(screen.getByTestId("mock-external-view-tracker-id")).toHaveTextContent("tracker-1");
      expect(screen.getByTestId("mock-connection-status-override")).toHaveTextContent("none");
    });

    act(() => {
      followLiveService.lastConnection?.emitStatus("error");
    });

    await waitFor(() => {
      expect(screen.getByTestId("mock-connection-status-override")).toHaveTextContent("error");
    });

    const resumedDirectory: TrackerDirectory = {
      ...initialDirectory,
      trackers: [
        { ...initialDirectory.trackers[0], isLive: false },
        { ...initialDirectory.trackers[1], isLive: true },
      ],
      liveTrackerId: "tracker-2",
    };

    act(() => {
      followLiveService.lastConnection?.emitStatus("connected");
      followLiveService.lastConnection?.emitDirectory(resumedDirectory);
    });

    await waitFor(() => {
      expect(screen.getByTestId("mock-connection-status-override")).toHaveTextContent("none");
      expect(screen.getByTestId("mock-external-view-tracker-id")).toHaveTextContent("tracker-2");
    });
  });
});
