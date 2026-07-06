import { describe, expect, it } from "vitest";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import { aDirectoryWith, aTrackerWith } from "@guilty-spark/shared/contracts/individual-tracker/fakes/follow.fake";
import { ComponentLoaderStatus } from "../../../component-loader/component-loader";
import { FollowLiveOverlayPresenter } from "../follow-live-overlay-presenter";

describe("FollowLiveOverlayPresenter", () => {
  it("falls back to an isLive tracker when liveTrackerId does not match", () => {
    const directory: TrackerDirectory = aDirectoryWith({
      trackers: [
        aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: false }),
        aTrackerWith({ trackerId: "tracker-2", gamertag: "Spartan Two", isLive: true }),
      ],
      liveTrackerId: "tracker-missing",
    });
    const presenter = new FollowLiveOverlayPresenter();

    const overlay = presenter.present({
      gamertag: "Streamer",
      directory,
      directoryStatus: "connected",
    });

    expect(overlay.liveTrackerId).toBe("tracker-2");
    expect(overlay.liveTrackerView?.trackerId).toBe("tracker-2");
    expect(overlay.loadStatus).toBe(ComponentLoaderStatus.LOADED);
    expect(overlay.title).toBe("Streamer overlay - Spartan Two live - Guilty Spark");
  });

  it("returns non-live overlay title when there is no live tracker", () => {
    const directory: TrackerDirectory = aDirectoryWith({
      trackers: [aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: false })],
      liveTrackerId: null,
    });
    const presenter = new FollowLiveOverlayPresenter();

    const overlay = presenter.present({
      gamertag: "Streamer",
      directory,
      directoryStatus: "connected",
    });

    expect(overlay.loadStatus).toBe(ComponentLoaderStatus.LOADED);
    expect(overlay.title).toBe("Streamer overlay - Guilty Spark");
  });
});
