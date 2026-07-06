import { describe, expect, it } from "vitest";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import { aDirectoryWith, aTrackerWith } from "@guilty-spark/shared/contracts/individual-tracker/fakes/follow.fake";
import { FollowLivePresenter } from "../follow-live-presenter";

describe("FollowLivePresenter", () => {
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
    const presenter = new FollowLivePresenter();

    const result = presenter.presentViewer({
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
    const presenter = new FollowLivePresenter();

    const connecting = presenter.presentViewer({
      gamertag: "Streamer",
      directory: null,
      directoryStatus: "connecting",
      selectedTrackerId: null,
    });
    const disconnected = presenter.presentViewer({
      gamertag: "Streamer",
      directory: null,
      directoryStatus: "disconnected",
      selectedTrackerId: null,
    });
    const error = presenter.presentViewer({
      gamertag: "Streamer",
      directory: null,
      directoryStatus: "error",
      selectedTrackerId: null,
    });

    expect(connecting.connectionStatusOverride).toBe("connecting");
    expect(disconnected.connectionStatusOverride).toBe("disconnected");
    expect(error.connectionStatusOverride).toBe("error");
  });

  it("falls back to an isLive tracker when liveTrackerId does not match", () => {
    const directory: TrackerDirectory = aDirectoryWith({
      trackers: [
        aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: false }),
        aTrackerWith({ trackerId: "tracker-2", gamertag: "Spartan Two", isLive: true }),
      ],
      liveTrackerId: "tracker-missing",
    });
    const presenter = new FollowLivePresenter();

    const overlay = presenter.presentOverlay({
      gamertag: "Streamer",
      directory,
    });

    expect(overlay.liveTracker?.trackerId).toBe("tracker-2");
    expect(overlay.liveTrackerView?.trackerId).toBe("tracker-2");
    expect(overlay.title).toBe("Streamer overlay - Spartan Two live - Guilty Spark");
  });

  it("returns non-live titles when there is no live tracker", () => {
    const directory: TrackerDirectory = aDirectoryWith({
      trackers: [aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: false })],
      liveTrackerId: null,
    });
    const presenter = new FollowLivePresenter();

    const viewer = presenter.presentViewer({
      gamertag: "Streamer",
      directory,
      directoryStatus: "connected",
      selectedTrackerId: null,
    });
    const overlay = presenter.presentOverlay({
      gamertag: "Streamer",
      directory,
    });

    expect(viewer.title).toBe("Streamer live view - Guilty Spark");
    expect(overlay.title).toBe("Streamer overlay - Guilty Spark");
  });
});
