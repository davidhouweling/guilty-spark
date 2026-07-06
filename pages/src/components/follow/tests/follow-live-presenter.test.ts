import { describe, expect, it } from "vitest";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import { aDirectoryWith, aTrackerWith } from "@guilty-spark/shared/contracts/individual-tracker/fakes/follow.fake";
import { FollowLiveOverlayViewerPresenter } from "../follow-live-overlay-viewer/follow-live-overlay-viewer-presenter";
import { FollowLiveViewerPresenter } from "../follow-live-viewer/follow-live-viewer-presenter";

describe("FollowLiveViewerPresenter", () => {
  it("presents selected tracker view with directory streamer settings", () => {
    const directory: TrackerDirectory = aDirectoryWith({
      streamerSettings: {
        styleFlags: {
          matchmakingMyStatsOnly: true,
        },
      },
      trackers: [
        aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: false }),
        aTrackerWith({ trackerId: "tracker-2", gamertag: "Spartan Two", isLive: true }),
      ],
      liveTrackerId: "tracker-2",
    });
    const presenter = new FollowLiveViewerPresenter();

    const result = presenter.present({
      gamertag: "Streamer",
      directory,
      directoryStatus: "connected",
      selectedTrackerId: "tracker-2",
    });

    expect(result.selectedTracker?.trackerId).toBe("tracker-2");
    expect(result.selectedTrackerView?.trackerId).toBe("tracker-2");
    expect(result.selectedTrackerView?.streamerSettings?.styleFlags?.matchmakingMyStatsOnly).toBe(true);
    expect(result.connectionStatusOverride).toBeUndefined();
    expect(result.showTabs).toBe(true);
    expect(result.title).toBe("Streamer live view - Spartan Two live - Guilty Spark");
  });

  it("maps non-connected directory status to viewer connection status override", () => {
    const presenter = new FollowLiveViewerPresenter();

    const connecting = presenter.present({
      gamertag: "Streamer",
      directory: null,
      directoryStatus: "connecting",
      selectedTrackerId: null,
    });
    const disconnected = presenter.present({
      gamertag: "Streamer",
      directory: null,
      directoryStatus: "disconnected",
      selectedTrackerId: null,
    });
    const error = presenter.present({
      gamertag: "Streamer",
      directory: null,
      directoryStatus: "error",
      selectedTrackerId: null,
    });

    expect(connecting.connectionStatusOverride).toBe("connecting");
    expect(disconnected.connectionStatusOverride).toBe("disconnected");
    expect(error.connectionStatusOverride).toBe("error");
  });

  it("returns non-live viewer title when there is no live tracker", () => {
    const directory: TrackerDirectory = aDirectoryWith({
      trackers: [aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: false })],
      liveTrackerId: null,
    });
    const presenter = new FollowLiveViewerPresenter();

    const viewer = presenter.present({
      gamertag: "Streamer",
      directory,
      directoryStatus: "connected",
      selectedTrackerId: null,
    });

    expect(viewer.title).toBe("Streamer live view - Guilty Spark");
  });
});

describe("FollowLiveOverlayViewerPresenter", () => {

  it("falls back to an isLive tracker when liveTrackerId does not match", () => {
    const directory: TrackerDirectory = aDirectoryWith({
      trackers: [
        aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: false }),
        aTrackerWith({ trackerId: "tracker-2", gamertag: "Spartan Two", isLive: true }),
      ],
      liveTrackerId: "tracker-missing",
    });
    const presenter = new FollowLiveOverlayViewerPresenter();

    const overlay = presenter.present({
      gamertag: "Streamer",
      directory,
    });

    expect(overlay.liveTracker?.trackerId).toBe("tracker-2");
    expect(overlay.liveTrackerView?.trackerId).toBe("tracker-2");
    expect(overlay.title).toBe("Streamer overlay - Spartan Two live - Guilty Spark");
  });

  it("returns non-live overlay title when there is no live tracker", () => {
    const directory: TrackerDirectory = aDirectoryWith({
      trackers: [aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: false })],
      liveTrackerId: null,
    });
    const presenter = new FollowLiveOverlayViewerPresenter();

    const overlay = presenter.present({
      gamertag: "Streamer",
      directory,
    });

    expect(overlay.title).toBe("Streamer overlay - Guilty Spark");
  });
});
