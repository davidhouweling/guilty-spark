import { describe, expect, it } from "vitest";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import { aDirectoryWith, aTrackerWith } from "@guilty-spark/shared/contracts/individual-tracker/fakes/follow.fake";
import { FollowLiveViewerPresenter } from "../follow-live-viewer-presenter";

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

    expect(result.resolvedSelectedTrackerId).toBe("tracker-2");
    expect(result.selectedTrackerView?.trackerId).toBe("tracker-2");
    expect(result.selectedTrackerView?.streamerSettings?.styleFlags?.matchmakingMyStatsOnly).toBe(true);
    expect(result.selectedTrackerStreamerSettings?.styleFlags?.matchmakingMyStatsOnly).toBe(true);
    expect(result.connectionStatusOverride).toBeUndefined();
    expect(result.showTabs).toBe(true);
    expect(result.showDirectoryError).toBe(false);
    expect(result.showDirectoryLoading).toBe(false);
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
