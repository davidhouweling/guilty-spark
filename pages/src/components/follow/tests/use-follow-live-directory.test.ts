import { describe, expect, it } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import { aFakeFollowLiveServiceWith } from "../../../services/follow/fakes/follow.fake";
import { useFollowLiveDirectory } from "../use-follow-live-directory";

function aDirectory(overrides: Partial<TrackerDirectory> = {}): TrackerDirectory {
  return {
    trackers: [
      {
        trackerId: "tracker-1",
        gamertag: "Spartan One",
        status: "active",
        isLive: true,
        accumulated: { total: 5, wins: 3, losses: 2, ties: 0 },
      },
      {
        trackerId: "tracker-2",
        gamertag: "Spartan Two",
        status: "active",
        isLive: false,
        accumulated: { total: 2, wins: 1, losses: 1, ties: 0 },
      },
    ],
    ...overrides,
  };
}

describe("useFollowLiveDirectory", () => {
  it("loads directory on mount and sets selectedTrackerId to the live tracker", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectory() });
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.directory).not.toBeNull();
    });

    expect(result.current.selectedTrackerId).toBe("tracker-1");
    expect(result.current.isFollowingLive).toBe(true);
    expect(result.current.directoryStatus).toBe("connected");
  });

  it("sets selectedTrackerId to null when no tracker is live", async () => {
    const dir: TrackerDirectory = {
      trackers: [
        {
          trackerId: "tracker-1",
          gamertag: "Spartan One",
          status: "active",
          isLive: false,
          accumulated: { total: 0, wins: 0, losses: 0, ties: 0 },
        },
      ],
    };
    const service = aFakeFollowLiveServiceWith({ directory: dir });
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.directory).not.toBeNull();
    });

    expect(result.current.selectedTrackerId).toBeNull();
  });

  it("propagates directory WS updates to directory state", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectory() });
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.directory).not.toBeNull();
    });

    const updatedDir: TrackerDirectory = {
      trackers: [
        {
          trackerId: "tracker-1",
          gamertag: "Spartan One",
          status: "active",
          isLive: true,
          accumulated: { total: 6, wins: 4, losses: 2, ties: 0 },
        },
        {
          trackerId: "tracker-2",
          gamertag: "Spartan Two",
          status: "active",
          isLive: false,
          accumulated: { total: 3, wins: 1, losses: 2, ties: 0 },
        },
      ],
    };

    act(() => {
      service.lastConnection?.emitDirectory(updatedDir);
    });

    expect(result.current.directory?.trackers[0].accumulated.wins).toBe(4);
  });

  it("auto-switches selectedTrackerId when isFollowingLive is true and live tracker changes", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectory() });
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.selectedTrackerId).toBe("tracker-1");
    });

    const updatedDir: TrackerDirectory = {
      trackers: [
        {
          trackerId: "tracker-1",
          gamertag: "Spartan One",
          status: "active",
          isLive: false,
          accumulated: { total: 5, wins: 3, losses: 2, ties: 0 },
        },
        {
          trackerId: "tracker-2",
          gamertag: "Spartan Two",
          status: "active",
          isLive: true,
          accumulated: { total: 2, wins: 1, losses: 1, ties: 0 },
        },
      ],
    };

    act(() => {
      service.lastConnection?.emitDirectory(updatedDir);
    });

    expect(result.current.selectedTrackerId).toBe("tracker-2");
  });

  it("does not auto-switch when isFollowingLive is false", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectory() });
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.selectedTrackerId).toBe("tracker-1");
    });

    // User manually selects tracker-2 (non-live) → isFollowingLive becomes false
    act(() => {
      result.current.onSelectTracker("tracker-2");
    });

    expect(result.current.isFollowingLive).toBe(false);

    // Live tracker changes to tracker-3 (different from the selected tracker-2)
    const updatedDir: TrackerDirectory = {
      trackers: [
        {
          trackerId: "tracker-1",
          gamertag: "Spartan One",
          status: "active",
          isLive: false,
          accumulated: { total: 5, wins: 3, losses: 2, ties: 0 },
        },
        {
          trackerId: "tracker-2",
          gamertag: "Spartan Two",
          status: "active",
          isLive: false,
          accumulated: { total: 3, wins: 2, losses: 1, ties: 0 },
        },
        {
          trackerId: "tracker-3",
          gamertag: "Spartan Three",
          status: "active",
          isLive: true,
          accumulated: { total: 1, wins: 1, losses: 0, ties: 0 },
        },
      ],
    };

    act(() => {
      service.lastConnection?.emitDirectory(updatedDir);
    });

    // Should stay on tracker-2 despite tracker-3 becoming live
    expect(result.current.selectedTrackerId).toBe("tracker-2");
  });

  it("onSelectTracker sets isFollowingLive to false when selecting a non-live tracker", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectory() });
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.directory).not.toBeNull();
    });

    act(() => {
      result.current.onSelectTracker("tracker-2");
    });

    expect(result.current.selectedTrackerId).toBe("tracker-2");
    expect(result.current.isFollowingLive).toBe(false);
  });

  it("onSelectTracker sets isFollowingLive to true when selecting the live tracker", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectory() });
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.directory).not.toBeNull();
    });

    act(() => {
      result.current.onSelectTracker("tracker-2");
    });

    expect(result.current.isFollowingLive).toBe(false);

    act(() => {
      result.current.onSelectTracker("tracker-1");
    });

    expect(result.current.selectedTrackerId).toBe("tracker-1");
    expect(result.current.isFollowingLive).toBe(true);
  });

  it("onFollowLive sets isFollowingLive to true and selects the live tracker", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectory() });
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.directory).not.toBeNull();
    });

    act(() => {
      result.current.onSelectTracker("tracker-2");
    });

    expect(result.current.isFollowingLive).toBe(false);

    act(() => {
      result.current.onFollowLive();
    });

    expect(result.current.isFollowingLive).toBe(true);
    expect(result.current.selectedTrackerId).toBe("tracker-1");
  });
});
